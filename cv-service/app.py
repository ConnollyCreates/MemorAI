from fastapi import FastAPI

app = FastAPI()

import numpy as np, cv2, os
from fastapi import UploadFile, File, Form
from insightface.app import FaceAnalysis

THRESH = float(os.getenv("THRESHOLD", "0.68"))
DIM = 512

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)




fa = FaceAnalysis(name="buffalo_l")
fa.prepare(ctx_id=-1)  # CPU / ONNX

# Optional FAISS, with brute-force fallback
try:
    import faiss
    HAS_FAISS = True
    index = faiss.IndexFlatIP(DIM)
except Exception:
    HAS_FAISS = False
    index = None

people = []  # [{id,name,relationship,embedding: np.ndarray}]

def l2n(v):
    n = np.linalg.norm(v);  return v if n==0 else (v/n)

def rebuild_index():
    if not HAS_FAISS: return
    import numpy as np
    global index;  index = faiss.IndexFlatIP(DIM)
    if people:
        mat = np.stack([p["embedding"] for p in people]).astype("float32")
        index.add(mat)

def read_image(up: UploadFile):
    data = np.frombuffer(up.file.read(), np.uint8); up.file.seek(0)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)

@app.post("/embed")
async def embed(image: UploadFile = File(...)):
    frame = read_image(image)
    faces = fa.get(frame)
    if not faces: return {"ok": False, "reason": "no_face"}
    f = faces[0]
    emb = l2n(f.normed_embedding.astype("float32"))
    bbox = [int(x) for x in f.bbox]
    return {"ok": True, "embedding": emb.tolist(), "bbox": bbox}

@app.post("/enroll")
async def enroll(
    name: str = Form(...),
    relationship: str = Form(...),
    e1: UploadFile = File(...),
    e2: UploadFile = File(...),
    e3: UploadFile = File(...)
):
    embs = []
    for f in [e1, e2, e3]:
        r = await embed(f)
        if not r["ok"]: return {"ok": False, "reason": "no_face_in_enroll_image"}
        embs.append(np.array(r["embedding"], dtype="float32"))
    centroid = l2n(np.mean(np.stack(embs), axis=0).astype("float32"))
    pid = f"{name.lower()}_{len(people)}"
    people.append({"id": pid, "name": name, "relationship": relationship, "embedding": centroid})
    rebuild_index()
    return {"ok": True, "personId": pid}

@app.post("/recognize")
async def recognize(image: UploadFile = File(...), threshold: float = THRESH):
    frame = read_image(image)
    faces = fa.get(frame)
    if not faces: return {"name": "Unknown", "confidence": 0.0, "bbox": None}
    f = faces[0]
    emb = l2n(f.normed_embedding.astype("float32")).reshape(1,-1)
    bbox = [int(x) for x in f.bbox]

    if HAS_FAISS and index is not None and index.ntotal>0:
        sims, ids = index.search(emb, 1)
        sim = float(sims[0][0]); best = int(ids[0][0])
        return {"name": people[best]["name"] if sim>=threshold else "Unknown", "confidence": sim, "bbox": bbox}
    else:
        # brute-force cosine fallback (fine for 2–5 people)
        if not people: return {"name": "Unknown", "confidence": 0.0, "bbox": bbox}
        embs = np.stack([p["embedding"] for p in people])
        sims = (emb @ embs.T).flatten()
        best = int(np.argmax(sims)); sim = float(sims[best])
        return {"name": people[best]["name"] if sim>=threshold else "Unknown", "confidence": sim, "bbox": bbox}
