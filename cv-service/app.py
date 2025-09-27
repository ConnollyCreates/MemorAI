from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import numpy as np, cv2, os, time
from typing import List, Dict, Tuple
from insightface.app import FaceAnalysis

# ---------- Config ----------
THRESH = float(os.getenv("THRESHOLD", "0.65"))        # ID threshold (cosine on L2-normed)
DET_THRESH = float(os.getenv("DET_THRESHOLD", "0.38"))# Detector conf threshold (smaller -> more faces)
DIM = 512                                             # ArcFace embedding dim

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
fa = FaceAnalysis(name="buffalo_l")
# CPU (ctx_id=-1). You can tweak det_size=(320,320) for speed if needed.
fa.prepare(ctx_id=-1, det_thresh=DET_THRESH)

# ---------- Gallery / FAISS ----------
people: List[Dict] = []  # [{id,name,relationship,embedding: np.ndarray}]
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

def read_image(up: UploadFile) -> np.ndarray:
    data = np.frombuffer(up.file.read(), np.uint8); up.file.seek(0)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)

# ---------- Tiny IoU Tracker ----------
# Keeps boxes stable across frames so labels don't jump when multiple people move.
TRACKS: Dict[int, Dict] = {}    # track_id -> {"bbox":[x,y,w,h], "miss":int, "name":str, "conf":float, "ts":float}
NEXT_ID = 1
IOU_KEEP = float(os.getenv("IOU_THRESH", "0.30"))
MISS_TTL = int(os.getenv("MISS_TTL", "6"))  # frames to keep a track without match

def iou(b1: List[int], b2: List[int]) -> float:
    x1,y1,w1,h1 = b1; x2,y2,w2,h2 = b2
    xa, ya = max(x1,x2), max(y1,y2)
    xb, yb = min(x1+w1, x2+w2), min(y1+h1, y2+h2)
    inter = max(0, xb - xa) * max(0, yb - ya)
    union = w1*h1 + w2*h2 - inter
    return inter / union if union > 0 else 0.0

def assign_tracks(dets: List[Dict]) -> List[Dict]:
    """
    dets: [{"bbox":[x,y,w,h], "name":str, "conf":float}]
    returns dets with "track_id"
    """
    global NEXT_ID, TRACKS
    # Greedy IoU matching
    unmatched_tracks = set(TRACKS.keys())
    for d in dets:
        best_id, best_iou = None, 0.0
        for tid in list(unmatched_tracks):
            i = iou(TRACKS[tid]["bbox"], d["bbox"])
            if i > best_iou:
                best_iou, best_id = i, tid
        if best_id is not None and best_iou >= IOU_KEEP:
            # Update track
            TRACKS[best_id]["bbox"] = d["bbox"]
            TRACKS[best_id]["miss"] = 0
            TRACKS[best_id]["name"] = d["name"]
            TRACKS[best_id]["conf"] = d["conf"]
            TRACKS[best_id]["ts"] = time.time()
            d["track_id"] = best_id
            unmatched_tracks.discard(best_id)
        else:
            # Create new track
            tid = NEXT_ID; NEXT_ID += 1
            TRACKS[tid] = {"bbox": d["bbox"], "miss": 0, "name": d["name"], "conf": d["conf"], "ts": time.time()}
            d["track_id"] = tid

    # Age unmatched tracks
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
    # f.bbox is [x1,y1,x2,y2]; convert to [x,y,w,h] for consistency
    x1,y1,x2,y2 = [int(v) for v in f.bbox]
    return {"ok": True, "embedding": emb.tolist(), "bbox": [x1, y1, x2-x1, y2-y1]}

@app.post("/enroll")
async def enroll(
    name: str = Form(...),
    relationship: str = Form(...),
    e1: UploadFile = File(...),
    e2: UploadFile = File(...),
    e3: UploadFile = File(...)
):
    embs = []
    for f in (e1, e2, e3):
        r = await embed(f)
        if not r["ok"]:
            return {"ok": False, "reason": "no_face_in_enroll_image"}
        embs.append(np.array(r["embedding"], dtype="float32"))
    centroid = l2n(np.mean(np.stack(embs, axis=0), axis=0).astype("float32"))
    pid = f"{name.lower()}_{len(people)}"
    people.append({"id": pid, "name": name, "relationship": relationship, "embedding": centroid})
    rebuild_index()
    return {"ok": True, "personId": pid}

@app.post("/recognize")
async def recognize(image: UploadFile = File(...), threshold: float = THRESH):
    frame = read_image(image)
    faces = fa.get(frame)  # returns objects with .bbox, .normed_embedding
    if not faces:
        # still clear old tracks gradually
        assign_tracks([])
        return {"detections": []}

    # Build embedding batch for all faces
    embs = []
    bboxes = []
    for f in faces:
        emb = l2n(f.normed_embedding.astype("float32"))
        embs.append(emb)
        x1,y1,x2,y2 = [int(v) for v in f.bbox]
        bboxes.append([x1, y1, x2 - x1, y2 - y1])
    embs = np.stack(embs, axis=0).astype("float32")  # [N,512]

    # Search gallery
    names = []
    confs = []
    if people:
        if HAS_FAISS and index is not None and index.ntotal > 0:
            sims, ids = index.search(embs, 1)  # top-1 per face
            for i in range(len(faces)):
                sim = float(sims[i][0]); best = int(ids[i][0])
                if sim >= threshold:
                    names.append(people[best]["name"])
                else:
                    names.append("Unknown")
                confs.append(sim)
        else:
            # brute-force cosine
            gallery = np.stack([p["embedding"] for p in people]).astype("float32")  # [M,512]
            sims = embs @ gallery.T  # [N,M]
            best_ids = np.argmax(sims, axis=1)
            best_sims = sims[np.arange(len(faces)), best_ids]
            for sim, bid in zip(best_sims, best_ids):
                sim = float(sim)
                if sim >= threshold:
                    names.append(people[bid]["name"])
                else:
                    names.append("Unknown")
                confs.append(sim)
    else:
        names = ["Unknown"] * len(faces)
        confs = [0.0] * len(faces)

    # Prepare detections and assign tracks
    dets = [{"bbox": bboxes[i], "name": names[i], "conf": float(confs[i])} for i in range(len(faces))]
    dets = assign_tracks(dets)

    return {"detections": dets}

@app.get("/health")
def health():
    return {"ok": True, "people": len(people), "faiss": bool(HAS_FAISS and index is not None and (index.ntotal if people else 0))}
