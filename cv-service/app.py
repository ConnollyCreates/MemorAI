# app.py — CV service (FastAPI + InsightFace)
# - /embed: returns 512-d L2-normalized embedding from raw image bytes
# - /recognize, /recognize_fast: local recognition against in-memory gallery
# - /gallery/sync: pull centroid embeddings from backend (Firestore via Node)
# - /gallery/export: export current in-memory gallery (debug)
#
# MVP principle: CV does NOT download Azure blobs or write Firestore.
# Backend sends raw bytes to /embed, stores embeddings+images in Firestore/Azure.

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Tuple, Optional
import numpy as np
import cv2
import os
import time
import json
import requests

# ---------- Config ----------
THRESH: float = float(os.getenv("THRESHOLD", "0.60"))       # cosine threshold
DET_THRESH: float = float(os.getenv("DET_THRESHOLD", "0.38"))  # detector conf
DIM: int = 512
THROTTLE_MS: float = float(os.getenv("FAST_THROTTLE_MS", "250"))
ROI_MARGIN: float = float(os.getenv("ROI_MARGIN", "0.25"))
GALLERY_PATH: str = os.getenv("GALLERY_PATH", "gallery.json")
BACKEND_GALLERY_EXPORT: str = os.getenv(
    "BACKEND_GALLERY_EXPORT",
    "http://127.0.0.1:4000/cv/gallery/export"  # your Node backend should expose this
)

# ---------- App / CORS ----------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:4000",
        "http://localhost:4000",
        "http://127.0.0.1:3000",
        "http://localhost:3000",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# ---------- InsightFace ----------
try:
    from insightface.app import FaceAnalysis
    INSIGHTFACE_IMPORT_ERROR = None
except Exception as _e:
    FaceAnalysis = None  # type: ignore
    INSIGHTFACE_IMPORT_ERROR = _e

fa = None
if FaceAnalysis is not None:
    try:
        fa = FaceAnalysis(name="buffalo_l")
        # CPU mode; adjust det_size if you want more recall/accuracy
        fa.prepare(ctx_id=-1, det_thresh=DET_THRESH, det_size=(320, 320))
    except Exception as _e:
        print("[warn] failed to initialize FaceAnalysis; CV endpoints will be limited:", _e)
else:
    print("[warn] insightface import failed; CV endpoints will be limited:", INSIGHTFACE_IMPORT_ERROR)

# ---------- FAISS (optional) ----------
try:
    import faiss  # type: ignore
    HAS_FAISS = True
    index = faiss.IndexFlatIP(DIM)
except Exception:
    HAS_FAISS = False
    index = None

# ---------- Gallery ----------
# Each person: {"id": str, "name": str, "relationship": str, "embedding": np.ndarray (512,)}
people: List[Dict] = []

def l2n(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return v if n == 0 else (v / n)

def rebuild_index() -> None:
    global index
    if not HAS_FAISS:
        return
    index = faiss.IndexFlatIP(DIM)
    if people:
        mat = np.stack([p["embedding"] for p in people]).astype("float32")
        index.add(mat)

def save_people_local() -> None:
    # local JSON fallback for offline testing
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

def load_people_local() -> None:
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

def pull_gallery_from_backend() -> Tuple[bool, int]:
    """Fetch centroid embeddings JSON from backend export."""
    global people
    try:
        r = requests.get(BACKEND_GALLERY_EXPORT, timeout=6)
        r.raise_for_status()
        data = r.json()
        loaded = []
        for i, p in enumerate(data.get("people", [])):
            emb = np.array(p["embedding"], dtype="float32")
            emb = l2n(emb)  # defensive renormalization
            loaded.append({
                "id": p.get("id", f"p_{i}"),
                "name": p.get("name", f"person_{i}"),
                "relationship": p.get("relationship", ""),
                "embedding": emb,
            })
        people = loaded
        rebuild_index()
        print(f"[gallery] synced {len(people)} people from backend")
        return True, len(people)
    except Exception as e:
        print("[gallery] sync failed:", e)
        return False, 0

# Initial load: try backend, fall back to local file
_ok, _ = pull_gallery_from_backend()
if not _ok:
    load_people_local()

# ---------- Utility ----------
def read_image(up: UploadFile) -> np.ndarray:
    data = np.frombuffer(up.file.read(), np.uint8)
    up.file.seek(0)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Failed to decode image")
    return img

# ---------- Tracking (simple IoU) ----------
TRACKS: Dict[int, Dict] = {}
NEXT_ID = 1
IOU_KEEP = float(os.getenv("IOU_THRESH", "0.30"))
MISS_TTL = int(os.getenv("MISS_TTL", "6"))

def iou(b1: List[int], b2: List[int]) -> float:
    x1, y1, w1, h1 = b1; x2, y2, w2, h2 = b2
    xa, ya = max(x1, x2), max(y1, y2)
    xb, yb = min(x1 + w1, x2 + w2), min(y1 + h1, y2 + h2)
    inter = max(0, xb - xa) * max(0, yb - ya)
    union = w1 * h1 + w2 * h2 - inter
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
                "bbox": d["bbox"], "miss": 0, "name": d["name"], "conf": d["conf"], "ts": time.time()
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
@app.get("/health")
def health():
    det_size = None
    try:
        det_size = getattr(fa.models["detector"][1], "input_size", (None, None)) if fa else None
    except Exception:
        det_size = None
    return {
        "ok": True,
        "people": len(people),
        "faiss": bool(HAS_FAISS and index is not None and (index.ntotal if people else 0)),
        "threshold": THRESH,
        "det_thresh": DET_THRESH,
        "det_size": det_size,
        "backend_gallery": BACKEND_GALLERY_EXPORT,
    }

@app.post("/gallery/sync")
def gallery_sync():
    ok, n = pull_gallery_from_backend()
    if not ok:
        # try local as fallback
        load_people_local()
        return {"ok": False, "people": len(people), "source": "local_fallback"}
    return {"ok": True, "people": n, "source": "backend"}

@app.get("/gallery/export")
def gallery_export_current():
    serializable = [
        {
            "id": p["id"],
            "name": p["name"],
            "relationship": p.get("relationship", ""),
            "embedding": p["embedding"].tolist(),
        }
        for p in people
    ]
    return {"people": serializable}

@app.post("/embed")
async def embed(image: UploadFile = File(...)):
    if fa is None:
        return {"ok": False, "reason": "model_not_initialized"}
    try:
        frame = read_image(image)
    except Exception as e:
        return {"ok": False, "reason": f"decode_error: {e}"}

    faces = fa.get(frame)
    if not faces:
        return {"ok": False, "reason": "no_face"}

    f = faces[0]
    emb = l2n(f.normed_embedding.astype("float32"))
    x1, y1, x2, y2 = [int(v) for v in f.bbox]
    return {"ok": True, "embedding": emb.tolist(), "bbox": [x1, y1, x2 - x1, y2 - y1]}

@app.post("/recognize")
async def recognize(image: UploadFile = File(...), threshold: float = THRESH):
    if fa is None:
        return {"detections": [], "reason": "model_not_initialized"}

    try:
        frame = read_image(image)
    except Exception as e:
        return {"detections": [], "reason": f"decode_error: {e}"}

    faces = fa.get(frame)
    if not faces:
        assign_tracks([])
        return {"detections": []}

    embs: List[np.ndarray] = []
    bboxes: List[List[int]] = []
    for f in faces:
        embs.append(l2n(f.normed_embedding.astype("float32")))
        x1, y1, x2, y2 = [int(v) for v in f.bbox]
        bboxes.append([x1, y1, x2 - x1, y2 - y1])

    embs_mat = np.stack(embs, axis=0).astype("float32")

    names: List[str] = []
    confs: List[float] = []

    if people:
        if HAS_FAISS and index is not None and index.ntotal > 0:
            sims, ids = index.search(embs_mat, 1)
            for i in range(len(bboxes)):
                sim = float(sims[i][0]); best = int(ids[i][0])
                names.append(people[best]["name"] if sim >= threshold else "Unknown")
                confs.append(sim)
        else:
            gallery = np.stack([p["embedding"] for p in people]).astype("float32")
            sims = embs_mat @ gallery.T  # cosine since L2-normalized
            best_ids = np.argmax(sims, axis=1)
            best_sims = sims[np.arange(len(bboxes)), best_ids]
            for sim, bid in zip(best_sims, best_ids):
                simf = float(sim)
                names.append(people[bid]["name"] if simf >= threshold else "Unknown")
                confs.append(simf)
    else:
        names = ["Unknown"] * len(bboxes)
        confs = [0.0] * len(bboxes)

    dets = [{"bbox": bboxes[i], "name": names[i], "conf": float(confs[i])} for i in range(len(bboxes))]
    dets = assign_tracks(dets)
    return {"detections": dets}

_last_fast: Dict[str, Optional[object]] = {"time": 0.0, "payload": None}
def _now_ms() -> float: return time.time() * 1000.0
def _clamp(v: int, lo: int, hi: int) -> int: return max(lo, min(hi, v))



@app.post("/recognize_fast")
async def recognize_fast(
    image: UploadFile = File(...),
    threshold: float = THRESH,
    prev_bbox: Optional[str] = Form(None),  # JSON "[x,y,w,h]" in posted-image space
    send_w: Optional[int] = Form(None),
    send_h: Optional[int] = Form(None),
    prev_x: Optional[float] = Form(None),
    prev_y: Optional[float] = Form(None),
    prev_w: Optional[float] = Form(None),
    prev_h: Optional[float] = Form(None),
):
    if fa is None:
        return {"detections": [], "reason": "model_not_initialized"}

    tnow = _now_ms()
    if _last_fast["payload"] is not None and (tnow - float(_last_fast["time"])) < THROTTLE_MS:
        return _last_fast["payload"]

    try:
        frame = read_image(image)
    except Exception as e:
        payload = {"detections": [], "reason": f"decode_error: {e}"}
        _last_fast.update(time=tnow, payload=payload)
        return payload

    H, W = frame.shape[:2]
    roi_full: Optional[Tuple[int, int, int, int]] = None

    # ROI from previous bbox (fast path)
    if prev_bbox:
        try:
            x, y, w, h = json.loads(prev_bbox)
            m = int(ROI_MARGIN * max(w, h))
            x1 = _clamp(int(x - m), 0, W - 1)
            y1 = _clamp(int(y - m), 0, H - 1)
            x2 = _clamp(int(x + w + m), 0, W - 1)
            y2 = _clamp(int(y + h + m), 0, H - 1)
            if (x2 - x1) >= 10 and (y2 - y1) >= 10:
                roi_full = (x1, y1, x2, y2)
        except Exception:
            roi_full = None
    elif all(v is not None for v in (send_w, send_h, prev_x, prev_y, prev_w, prev_h)):
        try:
            sx = W / float(send_w); sy = H / float(send_h)
            x = float(prev_x) * sx; y = float(prev_y) * sy
            w = float(prev_w) * sx; h = float(prev_h) * sy
            m = int(ROI_MARGIN * max(w, h))
            x1 = _clamp(int(x - m), 0, W - 1)
            y1 = _clamp(int(y - m), 0, H - 1)
            x2 = _clamp(int(x + w + m), 0, W - 1)
            y2 = _clamp(int(y + h + m), 0, H - 1)
            if (x2 - x1) >= 10 and (y2 - y1) >= 10:
                roi_full = (x1, y1, x2, y2)
        except Exception:
            roi_full = None

    # Detect within ROI if available, otherwise full frame
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

    # Match against gallery
    name, sim = "Unknown", 0.0
    if people:
        if HAS_FAISS and index is not None and index.ntotal > 0:
            sims, ids = index.search(emb, 1)
            sim = float(sims[0][0]); best = int(ids[0][0])
            if sim >= threshold: name = people[best]["name"]
        else:
            gallery = np.stack([p["embedding"] for p in people]).astype("float32")
            sims = (emb @ gallery.T).flatten()  # cosine since L2-normalized
            best = int(np.argmax(sims)); sim = float(sims[best])
            if sim >= threshold: name = people[best]["name"]

    det = {"track_id": 1, "bbox": [int(v) for v in bbox], "name": name, "conf": sim}
    payload = {"detections": [det]}
    _last_fast.update(time=tnow, payload=payload)
    return payload
