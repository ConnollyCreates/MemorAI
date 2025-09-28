from fastapi import FastAPI, UploadFile, File, Form, Query
import sys as _sys, os as _os
_sys.path.append(_os.path.dirname(_os.path.abspath(__file__)))
from fastapi.middleware.cors import CORSMiddleware
import numpy as np, cv2, os, time, json
from typing import List, Dict
from pydantic import BaseModel
import requests as pyreq
try:
    from insightface.app import FaceAnalysis
    INSIGHTFACE_IMPORT_ERROR = None
except Exception as _e:
    FaceAnalysis = None
    INSIGHTFACE_IMPORT_ERROR = _e

# Import Firestore service
try:
    from firestore_service import firestore_service  # type: ignore[reportMissingImports]
    HAS_FIRESTORE = True
except Exception as e:
    print(f"[warn] Firestore service disabled: {e}")
    HAS_FIRESTORE = False
    firestore_service = None

# ---------- Config ----------
THRESH      = float(os.getenv("THRESHOLD", "0.35"))   # ID threshold (cosine on L2-normed) - lowered for better recognition
DET_THRESH  = float(os.getenv("DET_THRESHOLD", "0.38")) # Detector conf threshold
DIM         = 512
THROTTLE_MS = float(os.getenv("FAST_THROTTLE_MS", "250"))
ROI_MARGIN  = float(os.getenv("ROI_MARGIN", "0.25"))

# ---------- App / CORS ----------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# Optional: reduce noisy library warnings via env toggles
if os.getenv("ALBUMENTATIONS_DISABLE_VERSION_CHECK") is None:
    os.environ["ALBUMENTATIONS_DISABLE_VERSION_CHECK"] = "1"
if os.getenv("ORT_LOGGING_LEVEL") is None:
    os.environ["ORT_LOGGING_LEVEL"] = "ERROR"

# Gemini AI for memory descriptions
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent"

def generate_memory_description(person_name: str, relationship: str, photos: list) -> str:
    """Generate a sentimental memory description using Gemini AI"""
    if not GEMINI_API_KEY:
        return f"A cherished memory with {person_name}."
    
    try:
        # Build context from photos
        photo_contexts = []
        for photo in photos[-3:]:  # Use last 3 photos
            desc = photo.get("photoDescription", "")
            if desc:
                photo_contexts.append(desc)
        
        context = f"Person: {person_name} ({relationship})\n"
        if photo_contexts:
            context += f"Recent memories: {'; '.join(photo_contexts)}\n"
        
        prompt = f"""Based on this information about {person_name}, create a short, warm, sentimental message (1-2 sentences) that would be meaningful to display when someone sees them:

{context}

Make it personal and heartwarming, focusing on the relationship and shared memories. Keep it under 50 words."""

        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }]
        }
        
        headers = {"Content-Type": "application/json"}
        response = pyreq.post(
            f"{GEMINI_URL}?key={GEMINI_API_KEY}",
            json=payload,
            headers=headers,
            timeout=10,
            verify=_VERIFY_PARAM
        )
        
        if response.status_code == 200:
            data = response.json()
            if "candidates" in data and data["candidates"]:
                text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                return text if len(text) < 200 else f"A cherished memory with {person_name}."
    except Exception as e:
        print(f"[warn] Gemini API error for {person_name}: {e}")
    
    return f"A cherished memory with {person_name}."

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

# ---------- Firestore sync helper ----------
def _sync_gallery_from_firestore_impl(max_photos: int = 3):
    if not HAS_FIRESTORE or not firestore_service:
        return {"ok": False, "reason": "firestore_disabled"}
    if fa is None:
        return {"ok": False, "reason": "fa_not_initialized"}

    synced = []
    errors = []
    try:
        # Ensure we read the latest Firestore state
        try:
            firestore_service.invalidate_caches()
        except Exception:
            pass
        names = firestore_service.get_all_people(bypass_cache=True)
        for name in names:
            pdata = firestore_service.get_person_data(name, bypass_cache=True)
            if not pdata:
                errors.append({"name": name, "reason": "no_person_data"}); continue
            urls = [p.get("photoURL") for p in (pdata.get("photos") or []) if p.get("photoURL")] 
            urls = urls[-max_photos:] if urls else []
            if not urls:
                errors.append({"name": name, "reason": "no_photo_urls"}); continue

            imgs = []
            for u in urls:
                img = read_image_from_url(u)
                if img is not None:
                    imgs.append(img)
            if not imgs:
                errors.append({"name": name, "reason": "download_failed"}); continue

            embs = []
            for img in imgs:
                faces = fa.get(img)
                if not faces:
                    continue
                embs.append(l2n(faces[0].normed_embedding.astype("float32")))
            if not embs:
                errors.append({"name": name, "reason": "no_face_in_images"}); continue
            centroid = l2n(np.mean(np.stack(embs, axis=0), axis=0).astype("float32"))

            # replace existing entries with same name
            global people
            people = [p for p in people if p["name"] != name]
            pid = f"{name.lower()}_{len(people)}"
            people.append({"id": pid, "name": name, "relationship": pdata.get("relation", ""), "embedding": centroid})
        rebuild_index(); save_people()
        synced = [p["name"] for p in people]
        return {"ok": True, "synced_names": synced, "errors": errors}
    except Exception as e:
        return {"ok": False, "error": str(e), "synced_names": synced, "errors": errors}

def read_image(up: UploadFile) -> np.ndarray:
    data = np.frombuffer(up.file.read(), np.uint8); up.file.seek(0)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)

_VERIFY_SSL = os.getenv("REQUESTS_VERIFY", "1") not in ("0", "false", "False")
if os.getenv("CV_INSECURE_SKIP_VERIFY", "0") in ("1", "true", "True"):
    _VERIFY_SSL = False
_CA_BUNDLE = os.getenv("REQUESTS_CA_BUNDLE") or os.getenv("CURL_CA_BUNDLE")
_VERIFY_PARAM = _CA_BUNDLE if (_VERIFY_SSL and _CA_BUNDLE) else _VERIFY_SSL

def read_image_from_url(url: str, timeout: float = 15.0) -> np.ndarray | None:
    try:
        rsp = pyreq.get(url, timeout=timeout, verify=_VERIFY_PARAM)
        if rsp.status_code != 200:
            print(f"[warn] fetch image failed {rsp.status_code} {url}")
            return None
        arr = np.frombuffer(rsp.content, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        print(f"[warn] read_image_from_url error for {url}: {e}")
        return None

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

class EnrollFromUrlsBody(BaseModel):
    name: str
    relationship: str = ""
    urls: List[str]

@app.post("/enroll_from_urls")
def enroll_from_urls(body: EnrollFromUrlsBody):
    if fa is None:
        return {"ok": False, "reason": "fa_not_initialized"}
    imgs: List[np.ndarray] = []
    for u in body.urls[:3]:
        img = read_image_from_url(u)
        if img is not None:
            imgs.append(img)
    if len(imgs) < 1:
        return {"ok": False, "reason": "no_images_downloaded"}

    embs = []
    for img in imgs:
        faces = fa.get(img)
        if not faces:
            continue
        f = faces[0]
        embs.append(l2n(f.normed_embedding.astype("float32")))
    if len(embs) == 0:
        return {"ok": False, "reason": "no_face_in_images"}
    centroid = l2n(np.mean(np.stack(embs, axis=0), axis=0).astype("float32"))

    # replace existing entries with same name
    global people
    people = [p for p in people if p["name"] != body.name]
    pid = f"{body.name.lower()}_{len(people)}"
    people.append({"id": pid, "name": body.name, "relationship": body.relationship, "embedding": centroid})
    rebuild_index(); save_people()
    return {"ok": True, "personId": pid, "images_used": len(embs)}

@app.post("/sync_gallery_from_firestore")
def sync_gallery_from_firestore(max_photos: int = 3):
    return _sync_gallery_from_firestore_impl(max_photos=max_photos)

# ---------- Startup hook: auto sync if empty ----------
@app.on_event("startup")
async def _startup_sync():
    # load gallery from disk
    load_people()
    if len(people) == 0 and HAS_FIRESTORE and firestore_service and os.getenv("AUTO_SYNC_GALLERY", "1") != "0":
        print("[info] gallery empty; auto-syncing from Firestore...")
        res = _sync_gallery_from_firestore_impl(max_photos=int(os.getenv("SYNC_MAX_PHOTOS", "3")))
        print("[info] auto-sync result:", res)

# ---------- Debug: SSL/OAuth/Firestore probe ----------
@app.get("/debug/ssl")
def debug_ssl():
    info = {
        "verify": _VERIFY_SSL,
        "ca_bundle": _CA_BUNDLE,
        "verify_param": _VERIFY_PARAM if isinstance(_VERIFY_PARAM, bool) else str(_VERIFY_PARAM),
        "firestore_enabled": HAS_FIRESTORE,
    }
    results = {}
    try:
        # oauth token
        if HAS_FIRESTORE and firestore_service:
            tok = firestore_service.get_access_token()
            results["oauth_token"] = "ok" if tok else "failed"
            # list people
            ppl = firestore_service.get_all_people()
            results["people_count"] = len(ppl)
        else:
            results["oauth_token"] = "firestore_disabled"
    except Exception as e:
        results["error"] = str(e)
    return {"info": info, "results": results}

@app.post("/recognize_with_memory")
async def recognize_with_memory(image: UploadFile = File(...), threshold: float = THRESH):
    """
    Enhanced recognition endpoint that returns memory card data for recognized faces
    """
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

    # Build enhanced detections with memory card data
    enhanced_detections = []
    for i in range(len(faces)):
        detection = {
            "bbox": bboxes[i],
            "name": names[i],
            "conf": float(confs[i]),
            "memory_card": None
        }
        # Always show a memory card for recognized faces, even if Firestore fails
        if names[i] != "Unknown":
            memory_card = None
            if HAS_FIRESTORE and firestore_service:
                try:
                    t0 = time.time()
                    person_data = firestore_service.get_person_data(names[i])
                    if person_data:
                        # First try to get enhanced description from backend
                        enhanced_description = None
                        try:
                            backend_url = os.getenv("BACKEND_URL", "http://127.0.0.1:4000")
                            enhance_response = pyreq.post(
                                f"{backend_url}/enhance-description",
                                json={
                                    "name": person_data["name"],
                                    "relation": person_data["relation"],
                                    "photos": person_data["photos"]
                                },
                                timeout=5,
                                verify=_VERIFY_PARAM
                            )
                            if enhance_response.status_code == 200:
                                enhanced_data = enhance_response.json()
                                enhanced_description = enhanced_data.get("enhancedDescription")
                        except Exception as e:
                            print(f"[info] Backend enhancement failed for {person_data['name']}, trying Gemini: {e}")
                        
                        # Fallback to Gemini AI if backend fails
                        if not enhanced_description:
                            enhanced_description = generate_memory_description(
                                person_data["name"], 
                                person_data["relation"], 
                                person_data["photos"]
                            )
                        
                        memory_card = {
                            "name": person_data["name"],
                            "relation": person_data["relation"],
                            "photo_count": person_data["photo_count"],
                            "most_recent_photo": person_data["most_recent_photo"],
                            "photos": person_data["photos"],
                            "activity": enhanced_description
                        }
                        t_ms = int((time.time() - t0) * 1000)
                        print(f"✅ Memory card data loaded for {names[i]} in {t_ms} ms")
                    else:
                        print(f"❌ No memory card data found for {names[i]}")
                except Exception as e:
                    print(f"❌ Error fetching memory card for {names[i]}: {e}")
            # Fallback: always provide a default card if Firestore fails
            if not memory_card:
                memory_card = {
                    "name": names[i],
                    "relation": "Loved One",
                    "photo_count": 0,
                    "most_recent_photo": None,
                    "photos": [],
                    "activity": f"A favorite memory with {names[i]}."
                }
            detection["memory_card"] = memory_card
        enhanced_detections.append(detection)

    # Apply tracking
    enhanced_detections = assign_tracks(enhanced_detections)
    return {"detections": enhanced_detections}

# ---------- Debug helpers to validate recognition without camera ----------
class RecognizeFromUrlBody(BaseModel):
    url: str

@app.post("/recognize_from_url")
def recognize_from_url(body: RecognizeFromUrlBody, threshold: float = THRESH):
    if fa is None:
        return {"ok": False, "reason": "fa_not_initialized"}
    img = read_image_from_url(body.url)
    if img is None:
        return {"ok": False, "reason": "download_failed"}
    faces = fa.get(img)
    if not faces:
        return {"ok": True, "detections": []}
    embs = np.stack([l2n(f.normed_embedding.astype("float32")) for f in faces]).astype("float32")
    bboxes = [[int(f.bbox[0]), int(f.bbox[1]), int(f.bbox[2]-f.bbox[0]), int(f.bbox[3]-f.bbox[1])] for f in faces]
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
    dets = [{"bbox": bboxes[i], "name": names[i], "conf": float(confs[i])} for i in range(len(faces))]
    return {"ok": True, "detections": dets}

@app.get("/debug/recognize_latest")
def debug_recognize_latest(name: str = Query(..., description="Firestore person name"), threshold: float = THRESH):
    if not HAS_FIRESTORE or not firestore_service:
        return {"ok": False, "reason": "firestore_disabled"}
    pdata = firestore_service.get_person_data(name)
    if not pdata or not pdata.get("photos"):
        return {"ok": False, "reason": "no_photos"}
    url = pdata["photos"][-1].get("photoURL")
    if not url:
        return {"ok": False, "reason": "no_url"}
    return recognize_from_url(RecognizeFromUrlBody(url=url), threshold=threshold)

@app.get("/people")
async def get_all_people():
    """Get list of all people in the database"""
    if not HAS_FIRESTORE or not firestore_service:
        return {"people": [p["name"] for p in people]}  # Fallback to local gallery
    
    try:
        people_list = firestore_service.get_all_people()
        return {"people": people_list}
    except Exception as e:
        print(f"❌ Error fetching people list: {e}")
        return {"people": []}

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

# ---------- Debug endpoints ----------
@app.get("/debug/firestore/benchmark")
def debug_firestore_benchmark(name: str | None = None, trials: int = 3):
    if not HAS_FIRESTORE or not firestore_service:
        return {"ok": False, "reason": "firestore_disabled"}
    out = {"ok": True, "name": name, "trials": trials, "runs": []}
    # Benchmark get_all_people as a baseline
    t0 = time.time(); ppl = firestore_service.get_all_people(); t_all_ms = int((time.time() - t0) * 1000)
    out["all_people_ms"] = t_all_ms
    out["people_count"] = len(ppl)
    # Benchmark specific person if provided or first
    target = name if name else (ppl[0] if ppl else None)
    if target:
        for i in range(trials):
            t1 = time.time(); data = firestore_service.get_person_data(target); dt_ms = int((time.time() - t1) * 1000)
            out["runs"].append({"i": i, "ms": dt_ms, "found": bool(data)})
    return out

@app.get("/debug/cache/stats")
def debug_cache_stats():
    if not HAS_FIRESTORE or not firestore_service:
        return {"ok": False, "reason": "firestore_disabled"}
    stats = firestore_service.cache_stats()
    return {"ok": True, "stats": stats}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
