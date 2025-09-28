import express from "express";
import multer from "multer";
import { fetch } from "undici";

import { uploadPhotoAndGetUrl } from "../services/storage";

const router = express.Router();
const upload = multer(); // memory storage
const CV_URL = process.env.CV_URL || "http://127.0.0.1:8000";

// Get Firestore collection - will be passed from main app
let peopleCol: FirebaseFirestore.CollectionReference | null = null;

// Function to initialize the router with Firestore collection
export function initializePeopleRouter(collection: FirebaseFirestore.CollectionReference) {
  peopleCol = collection;
}

function l2norm(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return n > 0 ? v.map((x) => x / n) : v;
}

// ---- route ----
// POST /api/people (multipart/form-data)
// fields: name, relationship, activity; files: up to 3 images under "files"
router.post("/api/people", upload.array("files", 10), async (req, res) => {
  try {
    // Text fields are available in req.body (multer handles this)
    const { name, relationship, activity } = req.body as {
      name: string;
      relationship: string;
      activity: string;
    };
    
    // Files are available in req.files (an array)
    const files = (req.files || []) as Express.Multer.File[];

    if (!name || !relationship || !activity) {
      return res.status(400).json({ ok: false, error: "Missing name, relationship, or activity" });
    }
    if (!files || files.length < 3) {
      return res.status(400).json({ ok: false, error: "Must upload at least 3 photos" });
    }

    // 1) Generate Embeddings by calling FastAPI CV service's /embed endpoint
    const perImageEmbeddings: number[][] = [];
    for (const file of files.slice(0, 3)) {
      // Create new FormData for the CV service call (FastAPI /embed expects one file)
      const cvForm = new FormData();
      
      // Recreate the file buffer as a Blob for fetch
      const blob = new Blob([file.buffer], { type: file.mimetype });
      cvForm.append('image', blob, file.originalname); // Must use 'image' key for FastAPI /embed
      
      const cvResp = await fetch(`${CV_URL}/embed`, {
        method: 'POST',
        body: cvForm // FormData handles the 'multipart/form-data' header
      });
      
      const cvJson = await cvResp.json();

      if (!cvResp.ok || cvJson.reason) {
        throw new Error(`CV Embed failed for ${file.originalname}: ${cvJson.reason || 'Unknown error'}`);
      }
      
      perImageEmbeddings.push(cvJson.embedding); // Collect the 512-D vector
    }

    // 2) Calculate Centroid/Average Embedding
    const dim = perImageEmbeddings[0].length;
    const avg = Array(dim).fill(0);
    for (const e of perImageEmbeddings) for (let i = 0; i < dim; i++) avg[i] += e[i];
    for (let i = 0; i < dim; i++) avg[i] /= perImageEmbeddings.length;
    const centroid = l2norm(avg);

    // 3) Upload images to Azure
    const normalizedName = name.toLowerCase();
    const imageUrls: string[] = [];
    for (const f of files.slice(0, 3)) {
      const url = await uploadPhotoAndGetUrl(f.buffer, normalizedName);
      if (!url) throw new Error("Azure upload failed");
      imageUrls.push(url);
    }

    // 4) Store Data in Firestore
    const id = `${name.toLowerCase().replace(/\s+/g, "_")}__${relationship.toLowerCase()}`;
    await peopleCol!.doc(id).set({
      id,
      name,
      relationship,
      activity,
      imageUrls,
      embeddings: {
        centroid,
        perImage: perImageEmbeddings,
        dim,
        normalized: true,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 5) Tell CV to refresh (fire and forget)
    fetch(`${CV_URL}/gallery/sync`, { method: "POST" }).catch(() => {});

    return res.json({ 
      ok: true, 
      id, 
      name: name,
      imageUrls,
      message: 'Profile successfully enrolled and stored.'
    });
  } catch (e: any) {
    console.error("Enrollment process failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Enrollment failed on the server." });
  }
});

export default router;
