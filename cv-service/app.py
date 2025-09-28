from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import numpy as np, cv2, os, time, json
from typing import List, Dict
try:
    from insightface.app import FaceAnalysis
    INSIGHTFACE_IMPORT_ERROR = None
except Exception as _e:
    FaceAnalysis = None
    INSIGHTFACE_IMPORT_ERROR = _e

# ---------- Config ----------
THRESH      = float(os.getenv("THRESHOLD", "0.60"))   # ID threshold (cosine on L2-normed)
DET_THRESH  = float(os.getenv("DET_THRESHOLD", "0.38")) # Detector conf threshold
DIM         = 512
THROTTLE_MS = float(os.getenv("FAST_THROTTLE_MS", "250"))
ROI_MARGIN  = float(os.getenv("ROI_MARGIN", "0.25"))

# ---------- App / CORS ----------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# ---------- InsightFace ----------
fa = None
if FaceAnalysis is not None:
    try:
        fa = FaceAnalysis(name="buffalo_l")
        # CPU
        fa.prepare(ctx_id=-1, det_thresh=DET_THRESH, det_size=(320, 320))
    except Exception as _e:
        print("[warn] failed to initialize FaceAnalysis; CV endpoints will be disabled:", _e)
else:
    print("[warn] insightface import failed; CV endpoints will be disabled:", INSIGHTFACE_IMPORT_ERROR)

# ---------- Gallery / FAISS ----------
people: List[Dict] = []  # [{id,name,relationship,embedding: np.ndarray}]
GALLERY_PATH = os.getenv("GALLERY_PATH", "gallery.json")
try:
    import faiss
    HAS_FAISS = True
    index = faiss.IndexFlatIP(DIM)
except Exception:
    HAS_FAISS = False
    index = None

def l2n(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return v if n == 0 else (v / n)

def rebuild_index():
    global index
    if not HAS_FAISS:
        return
    index = faiss.IndexFlatIP(DIM)
    if people:
        mat = np.stack([p["embedding"] for p in people]).astype("float32")
        index.add(mat)

def save_people():
    try:
        serializable = [
            {
                "id": p["id"],
                "name": p["name"],
                "relationship": p.get("relationship", ""),
                "embedding": p["embedding"].tolist(),
            }
            for p in people
        ]
        with open(GALLERY_PATH, "w", encoding="utf-8") as f:
            json.dump({"people": serializable}, f)
    except Exception as e:
        print("[warn] failed to save gallery:", e)

def load_people():
    global people
    try:
        if os.path.exists(GALLERY_PATH):
            with open(GALLERY_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            loaded = data.get("people", [])
            people = [
                {
                    "id": p.get("id", f"p_{i}"),
                    "name": p["name"],
                    "relationship": p.get("relationship", ""),
                    "embedding": np.array(p["embedding"], dtype="float32"),
                }
                for i, p in enumerate(loaded)
            ]
            rebuild_index()
            print(f"[info] loaded {len(people)} people from {GALLERY_PATH}")
    except Exception as e:
        print("[warn] failed to load gallery:", e)

def read_image(up: UploadFile) -> np.ndarray:
    data = np.frombuffer(up.file.read(), np.uint8); up.file.seek(0)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)

# ---------- Tiny IoU Tracker ----------
TRACKS: Dict[int, Dict] = {}
NEXT_ID = 1
IOU_KEEP = float(os.getenv("IOU_THRESH", "0.30"))
MISS_TTL = int(os.getenv("MISS_TTL", "6"))

def iou(b1: List[int], b2: List[int]) -> float:
    x1,y1,w1,h1 = b1; x2,y2,w2,h2 = b2
    xa, ya = max(x1,x2), max(y1,y2)
    xb, yb = min(x1+w1, x2+w2), min(y1+h1, y2+h1)
    inter = max(0, xb - xa) * max(0, yb - ya)
    union = w1*h1 + w2*h2 - inter
    return inter / union if union > 0 else 0.0

def assign_tracks(dets: List[Dict]) -> List[Dict]:
    global NEXT_ID, TRACKS
    unmatched_tracks = set(TRACKS.keys())
    for d in dets:
        best_id, best_iou = None, 0.0
        for tid in list(unmatched_tracks):
            i = iou(TRACKS[tid]["bbox"], d["bbox"])
            if i > best_iou:
                best_iou, best_id = i, tid
        if best_id is not None and best_iou >= IOU_KEEP:
            TRACKS[best_id].update({
                "bbox": d["bbox"],
                "miss": 0,
                "name": d["name"],
                "conf": d["conf"],
                "ts": time.time(),
            })
            d["track_id"] = best_id
            unmatched_tracks.discard(best_id)
        else:
            tid = NEXT_ID; NEXT_ID += 1
            TRACKS[tid] = {"bbox": d["bbox"], "miss": 0, "name": d["name"], "conf": d["conf"], "ts": time.time()}
            d["track_id"] = tid

    for tid in list(unmatched_tracks):
        TRACKS[tid]["miss"] += 1
        if TRACKS[tid]["miss"] > MISS_TTL:
            del TRACKS[tid]
    return dets

# ---------- Endpoints ----------
@app.post("/embed")
async def embed(image: UploadFile = File(...)):
    frame = read_image(image)
    faces = fa.get(frame)
    if not faces:
        return {"ok": False, "reason": "no_face"}
    f = faces[0]
    emb = l2n(f.normed_embedding.astype("float32"))
    x1,y1,x2,y2 = [int(v) for v in f.bbox]
    return {"ok": True, "embedding": emb.tolist(), "bbox": [x1, y1, x2-x1, y2-y1]}

@app.post("/enroll")
async def enroll(
    name: str = Form(...),
    relationship: str = Form(...),
    e1: UploadFile = File(...),
    e2: UploadFile = File(...),
    e3: UploadFile = File(...),
):
    embs = []
    for f in (e1, e2, e3):
        r = await embed(f)
        if not r["ok"]:
            return {"ok": False, "reason": "no_face_in_enroll_image"}
        embs.append(np.array(r["embedding"], dtype="float32"))
    # normalize each, then mean, then normalize centroid
    embs = [l2n(e) for e in embs]
    centroid = l2n(np.mean(np.stack(embs, axis=0), axis=0).astype("float32"))
    pid = f"{name.lower()}_{len(people)}"
    people.append({"id": pid, "name": name, "relationship": relationship, "embedding": centroid})
    rebuild_index()
    save_people()
    return {"ok": True, "personId": pid}

@app.post("/recognize")
async def recognize(image: UploadFile = File(...), threshold: float = THRESH):
    frame = read_image(image)
    faces = fa.get(frame)
    if not faces:
        assign_tracks([])
        return {"detections": []}

    embs = []
    bboxes = []
    for f in faces:
        emb = l2n(f.normed_embedding.astype("float32"))
        embs.append(emb)
        x1,y1,x2,y2 = [int(v) for v in f.bbox]
        bboxes.append([x1, y1, x2 - x1, y2 - y1])
    embs = np.stack(embs, axis=0).astype("float32")

    names, confs = [], []
    if people:
        if HAS_FAISS and index is not None and index.ntotal > 0:
            sims, ids = index.search(embs, 1)
            for i in range(len(faces)):
                sim = float(sims[i][0]); best = int(ids[i][0])
                names.append(people[best]["name"] if sim >= threshold else "Unknown")
                confs.append(sim)
        else:
            gallery = np.stack([p["embedding"] for p in people]).astype("float32")
            sims = embs @ gallery.T
            best_ids = np.argmax(sims, axis=1)
            best_sims = sims[np.arange(len(faces)), best_ids]
            for sim, bid in zip(best_sims, best_ids):
                sim = float(sim)
                names.append(people[bid]["name"] if sim >= threshold else "Unknown")
                confs.append(sim)
    else:
        names = ["Unknown"] * len(faces)
        confs = [0.0] * len(faces)

    dets = [{"bbox": bboxes[i], "name": names[i], "conf": float(confs[i])} for i in range(len(faces))]
    dets = assign_tracks(dets)
    return {"detections": dets}

@app.get("/health")
def health():
    det_size = getattr(fa.models["detector"][1], "input_size", (None, None))
    return {
        "ok": True,
        "people": len(people),
        "faiss": bool(HAS_FAISS and index is not None and (index.ntotal if people else 0)),
        "threshold": THRESH,
        "det_thresh": DET_THRESH,
        "det_size": det_size,
    }

load_people()

_last_fast = {"time": 0.0, "payload": None}
def _now_ms(): return time.time() * 1000.0
def _clamp(v, lo, hi): return max(lo, min(hi, v))

@app.post("/recognize_fast")
async def recognize_fast(
    image: UploadFile = File(...),
    threshold: float = THRESH,
    # Preferred: full-frame JSON bbox string: "[x,y,w,h]" in POSTED IMAGE space
    prev_bbox: str | None = Form(None),
    # Legacy fallback: send-space fields (if client uses them)
    send_w: int | None = Form(None),
    send_h: int | None = Form(None),
    prev_x: float | None = Form(None),
    prev_y: float | None = Form(None),
    prev_w: float | None = Form(None),
    prev_h: float | None = Form(None),
):
    # throttle cache
    tnow = _now_ms()
    if _last_fast["payload"] is not None and (tnow - _last_fast["time"]) < THROTTLE_MS:
        return _last_fast["payload"]

    frame = read_image(image)
    H, W = frame.shape[:2]

    # Resolve ROI (full-frame == posted image space)
    roi_full = None
    bbox_source = "none"

    # A) full-frame JSON bbox
    if prev_bbox:
        try:
            x, y, w, h = json.loads(prev_bbox)
            m = int(ROI_MARGIN * max(w, h))
            x1 = _clamp(int(x - m), 0, W - 1)
            y1 = _clamp(int(y - m), 0, H - 1)
            x2 = _clamp(int(x + w + m), 0, W - 1)
            y2 = _clamp(int(y + h + m), 0, H - 1)
            # sanity: avoid tiny/degenerate ROI
            if (x2 - x1) >= 10 and (y2 - y1) >= 10:
                roi_full = (x1, y1, x2, y2)
                bbox_source = "prev_bbox"
        except Exception:
            roi_full = None

    # B) legacy send-space → full-frame
    if roi_full is None and all(v is not None for v in (send_w, send_h, prev_x, prev_y, prev_w, prev_h)):
        try:
            sx = W / float(send_w)
            sy = H / float(send_h)
            x = float(prev_x) * sx; y = float(prev_y) * sy
            w = float(prev_w) * sx; h = float(prev_h) * sy
            m = int(ROI_MARGIN * max(w, h))
            x1 = _clamp(int(x - m), 0, W - 1)
            y1 = _clamp(int(y - m), 0, H - 1)
            x2 = _clamp(int(x + w + m), 0, W - 1)
            y2 = _clamp(int(y + h + m), 0, H - 1)
            if (x2 - x1) >= 10 and (y2 - y1) >= 10:
                roi_full = (x1, y1, x2, y2)
                bbox_source = "send_space"
        except Exception:
            roi_full = None

    # Detect
    if roi_full:
        x1, y1, x2, y2 = roi_full
        crop = frame[y1:y2, x1:x2]
        faces = fa.get(crop)
        if faces:
            f = faces[0]
            emb = l2n(f.normed_embedding.astype("float32")).reshape(1, -1)
            bx1, by1, bx2, by2 = [int(v) for v in f.bbox]
            bbox = [x1 + bx1, y1 + by1, (bx2 - bx1), (by2 - by1)]
        else:
            # fallback to full-frame
            faces = fa.get(frame)
            if not faces:
                payload = {"detections": []}
                _last_fast.update(time=tnow, payload=payload)
                return payload
            f = faces[0]
            emb = l2n(f.normed_embedding.astype("float32")).reshape(1, -1)
            bx1, by1, bx2, by2 = [int(v) for v in f.bbox]
            bbox = [bx1, by1, (bx2 - bx1), (by2 - by1)]
    else:
        faces = fa.get(frame)
        if not faces:
            payload = {"detections": []}
            _last_fast.update(time=tnow, payload=payload)
            return payload
        f = faces[0]
        emb = l2n(f.normed_embedding.astype("float32")).reshape(1, -1)
        bx1, by1, bx2, by2 = [int(v) for v in f.bbox]
        bbox = [bx1, by1, (bx2 - bx1), (by2 - by1)]

    # recognition (top-1)
    name, sim = "Unknown", 0.0
    if people:
        if HAS_FAISS and index is not None and index.ntotal > 0:
            sims, ids = index.search(emb, 1)
            sim = float(sims[0][0]); best = int(ids[0][0])
            if sim >= threshold: name = people[best]["name"]
        else:
            gallery = np.stack([p["embedding"] for p in people]).astype("float32")
            sims = (emb @ gallery.T).flatten()
            best = int(np.argmax(sims)); sim = float(sims[best])
            if sim >= threshold: name = people[best]["name"]

    det = {"track_id": 1, "bbox": [int(v) for v in bbox], "name": name, "conf": sim}
    payload = {"detections": [det]}
    _last_fast.update(time=tnow, payload=payload)
    return payload
