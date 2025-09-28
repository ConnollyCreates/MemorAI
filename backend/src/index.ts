import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import admin from "firebase-admin";
import { fetch } from "undici";
import FormData from "form-data"; // accepts Buffers for file uploads
import { uploadPhotoWithMetadata } from "./services/photoService";

// ---------- ENV ----------
const PORT = Number(process.env.PORT || 4000);
const CV_URL = process.env.CV_URL || "http://127.0.0.1:8000";

// ---------- Firebase Admin (for Firestore embeddings) ----------
let firestoreReady = false;
try {
  if (!admin.apps.length) {
    const rawKey = process.env.FIREBASE_PRIVATE_KEY || "";
    const privateKey = rawKey.replace(/\\n/g, "\n"); // decode newlines from .env

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
  }
  firestoreReady = true;
} catch (e) {
  console.warn(
    "[backend] Firebase not initialized. CV enroll/gallery routes will 500 until creds are set:",
    e
  );
}

const db = firestoreReady ? admin.firestore() : (null as any);
const peopleCol = firestoreReady ? db.collection("people") : null;

// ---------- Express ----------
const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  })
);
app.use(express.json({ limit: "8mb" }));

// ---------- Helpers ----------
function l2norm(vec: number[]): number[] {
  let n = 0;
  for (const v of vec) n += v * v;
  n = Math.sqrt(n) || 1e-9;
  return vec.map((v) => v / n);
}

async function cvEmbedFromBuffer(buf: Buffer, filename = "img.jpg"): Promise<number[]> {
  const form: any = new FormData();
  // form-data accepts Buffers; provide a filename so the CV service sees a file
  form.append("image", buf as any, { filename, contentType: "image/jpeg" } as any);
  let r: any;
  try {
    // form.getHeaders() returns required multipart headers (content-type)
  r = await fetch(`${CV_URL}/embed`, { method: "POST", body: form as any, headers: form.getHeaders() as any });
  } catch (err) {
    console.error("cvEmbedFromBuffer: fetch to CV /embed failed:", err);
    throw err;
  }
  if (!r.ok) throw new Error(`/embed failed: ${r.status}`);
  const j = (await r.json()) as { ok: boolean; embedding?: number[]; reason?: string };
  if (!j.ok || !j.embedding) throw new Error(`embed not ok: ${j.reason || "unknown"}`);
  return j.embedding;
}

function ensureFirestore(res: express.Response): boolean {
  if (!firestoreReady) {
    res.status(500).json({
      ok: false,
      error:
        "Firestore not initialized. Check your FIREBASE_* env vars in the backend .env file.",
    });
    return false;
  }
  return true;
}

// helper to fetch an image URL into a Buffer (used by enrollByUrls)
async function fetchImageBuffer(url: string): Promise<Buffer> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch ${url} -> ${resp.status}`);
  const arr = new Uint8Array(await resp.arrayBuffer());
  return Buffer.from(arr);
}

// ---------- Routes ----------

// Root + health
app.get("/", (_req, res) => res.json({ ok: true, service: "backend" }));
app.get("/health", async (_req, res) => {
  let ppl = 0;
  if (firestoreReady) {
    try {
      ppl = (await peopleCol.get()).size;
    } catch {}
  }
  res.json({ ok: true, service: "backend", cv: CV_URL, people: ppl });
});

// Minimal /memories stub (AR page uses this)
app.get("/memories", (req, res) => {
  const personId = String(req.query.personId ?? "Unknown");
  res.json({
    item: {
      personId,
      caption: `A favorite memory with ${personId}.`,
      tags: ["family", "outdoor"],
      isPinned: true,
      why: ["pinned"],
    },
  });
});

// Photo upload endpoint (Azure blob + Firestore metadata) — unchanged
app.post("/api/upload-photo", upload.single("photo"), async (req, res) => {
  try {
    const { name, relation, photoDescription } = req.body;
    const file = req.file;

    if (!file || !name || !relation || !photoDescription) {
      return res.status(400).json({
        error: "Missing required fields: photo, name, relation, photoDescription",
      });
    }
    if (!file.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "File must be an image" });
    }
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: "File size must be less than 5MB" });
    }

    const result = await uploadPhotoWithMetadata({
      name,
      relation,
      photoDescription,
      photoBuffer: file.buffer,
    });

    if (result.success) {
      res.json({
        success: true,
        data: {
          fileName: file.originalname,
          fileSize: file.size,
          name,
          relation,
          photoDescription,
          photoUrl: result.photoUrl,
          firestoreId: result.firestoreId,
          uploadedAt: new Date().toISOString(),
        },
      });
    } else {
      res.status(500).json({ error: "Failed to upload photo", details: result.error });
    }
  } catch (error) {
    res.status(500).json({
      error: "Internal server error during photo upload",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * NEW — Enroll by URL: client uploads photos, collects 3 blob URLs,
 * then POSTs { name, relationship, urls: [...] } here.
 * We pull each URL, compute embeddings via CV, store centroid in Firestore,
 * then tell the CV to /gallery/sync.
 */
app.post("/cv/enrollByUrls", async (req, res) => {
  if (!ensureFirestore(res)) return;
  try {
    const { name, relationship, urls } = req.body || {};
    if (!name || !relationship || !Array.isArray(urls) || urls.length < 3) {
      return res.status(400).json({ ok: false, error: "name, relationship, urls[3] required" });
    }
    let b1: Buffer, b2: Buffer, b3: Buffer;
    try {
      [b1, b2, b3] = await Promise.all(urls.slice(0, 3).map((u: string) => fetchImageBuffer(u)));
    } catch (err) {
      console.error("enrollByUrls: failed to fetch one of the URLs:", err);
      return res.status(500).json({ ok: false, error: `Failed to fetch provided image URLs: ${String(err)}` });
    }

    let e1: number[], e2: number[], e3: number[];
    try {
      [e1, e2, e3] = await Promise.all([
        cvEmbedFromBuffer(b1, "u1.jpg"),
        cvEmbedFromBuffer(b2, "u2.jpg"),
        cvEmbedFromBuffer(b3, "u3.jpg"),
      ]);
    } catch (err) {
      console.error("enrollByUrls: CV embed failed:", err);
      return res.status(500).json({ ok: false, error: `CV embed failed: ${String(err)}` });
    }

    const centroid: number[] = e1.map((v, i) => (v + e2[i] + e3[i]) / 3);
    const norm = l2norm(centroid);

    const id = `${String(name).toLowerCase().replace(/\s+/g, "_")}__${String(
      relationship
    ).toLowerCase()}`;

    await peopleCol.doc(id).set(
      {
        id,
        name,
        relationship,
        embedding: norm,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Tell CV to refresh
    fetch(`${CV_URL}/gallery/sync`, { method: "POST" }).catch(() => {});
    return res.json({ ok: true, personId: id });
  } catch (e: any) {
    console.error("enrollByUrls error:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Admin helpers kept (useful but not required for URL enrollment)
app.post("/cv/gallery/upsert", async (req, res) => {
  if (!ensureFirestore(res)) return;
  try {
    const { id, name, relationship, embedding } = req.body || {};
    if (!Array.isArray(embedding) || embedding.length !== 512) {
      return res.status(400).json({ ok: false, error: "embedding[512] required" });
    }
    const pid =
      id ||
      `${String(name || "person").toLowerCase().replace(/\s+/g, "_")}__${String(
        relationship || "unknown"
      ).toLowerCase()}`;

    await peopleCol.doc(pid).set(
      {
        id: pid,
        name: name || pid,
        relationship: relationship || "",
        embedding: l2norm(embedding.map((x: any) => Number(x))),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    fetch(`${CV_URL}/gallery/sync`, { method: "POST" }).catch(() => {});
    return res.json({ ok: true, personId: pid });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post("/cv/gallery/clear", async (_req, res) => {
  if (!ensureFirestore(res)) return;
  try {
    const snap = await peopleCol.get();
    const batch = db.batch();
    snap.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    fetch(`${CV_URL}/gallery/sync`, { method: "POST" }).catch(() => {});
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get("/cv/gallery/export", async (_req, res) => {
  if (!ensureFirestore(res)) return;
  try {
    const snap = await peopleCol.get();
    const people: Array<{ id: string; name: string; relationship: string; embedding: number[] }> =
      [];
    snap.forEach((doc) => {
      const d = doc.data() as any;
      if (Array.isArray(d.embedding) && d.embedding.length === 512) {
        people.push({
          id: d.id,
          name: d.name,
          relationship: d.relationship || "",
          embedding: d.embedding.map((x: any) => Number(x)),
        });
      }
    });
    return res.json({ people });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// ---------- Listen ----------
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
