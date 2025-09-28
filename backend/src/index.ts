// index.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import admin from "firebase-admin";
import { fetch } from "undici";
import FormData from "form-data";

// services
import { uploadPhotoWithMetadata } from "./services/photoService";

// ---------- ENV ----------
const PORT = Number(process.env.PORT || 4000);
const CV_URL = process.env.CV_URL || "http://127.0.0.1:8000";

// ---------- Firebase Admin (for Firestore) ----------
let firestoreReady = false;
try {
  if (!admin.apps.length) {
    const rawKey = process.env.FIREBASE_PRIVATE_KEY || "";
    const privateKey = rawKey.replace(/\\n/g, "\n"); // decode \n from .env

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

const db = firestoreReady ? admin.firestore() : (null as unknown as FirebaseFirestore.Firestore);
const peopleCol = firestoreReady ? db.collection("people") : null;

// Import people router AFTER Firebase initialization
import peopleRouter, { initializePeopleRouter } from "./routes/people";

// ---------- Express ----------
const app = express();

// CORS + parsers FIRST
app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  })
);
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true }));

// Multer (memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ---------- Utils ----------
function l2norm(vec: number[]): number[] {
  let n = 0;
  for (const v of vec) n += v * v;
  n = Math.sqrt(n) || 1e-9;
  return vec.map((v) => v / n);
}

async function cvEmbedFromBuffer(buf: Buffer, filename = "img.jpg"): Promise<number[]> {
  const form: any = new FormData();
  form.append("image", buf as any, { filename, contentType: "image/jpeg" } as any);
  let r: any;
  try {
    r = await fetch(`${CV_URL}/embed`, {
      method: "POST",
      body: form as any,
      // @ts-ignore form-data types
      headers: (form as any).getHeaders?.() || {},
    });
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
  if (!firestoreReady || !peopleCol) {
    res.status(500).json({
      ok: false,
      error: "Firestore not initialized. Check FIREBASE_* env vars.",
    });
    return false;
  }
  return true;
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch ${url} -> ${resp.status}`);
  const arr = new Uint8Array(await resp.arrayBuffer());
  return Buffer.from(arr);
}

// ---------- Health / Root ----------
app.get("/", (_req, res) => res.json({ ok: true, service: "backend" }));
app.get("/health", async (_req, res) => {
  let ppl = 0;
  if (peopleCol) {
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

<<<<<<< HEAD
// Photo upload endpoint (Azure blob + Firestore metadata) — unchanged
app.post("/api/upload-photo", upload.single("photo"), async (req, res) => {
=======
// Enhanced description endpoint for CV service
app.post("/enhance-description", (req, res) => {
  try {
    const { name, relation, photos } = req.body as { name?: string; relation?: string; photos?: Array<{ photoDescription?: string }>; };

    if (!name || !photos || !Array.isArray(photos)) {
      return res.status(400).json({ error: 'Missing required fields: name and photos array' });
    }

    const nameLc = String(name).trim();
    const nameDisplay = nameLc.charAt(0).toUpperCase() + nameLc.slice(1);

    // 1) Gather up to last 3 non-empty descriptions
    const rawDescs = photos
      .map(p => (p?.photoDescription ?? "").trim())
      .filter(Boolean)
      .slice(-3);

    // 2) Normalize/sanitize phrases
    const cleaned: string[] = [];
    const seen = new Set<string>(); // for de-duplication (case-insensitive)
    for (const d of rawDescs) {
      // Remove trailing punctuation
      let s = d.replace(/[.!?]+$/g, "");
      // Collapse whitespace
      s = s.replace(/\s+/g, " ").trim();
      // Remove trailing "with ..." to avoid "with with"
      s = s.replace(/\bwith\b.*$/i, "").trim();
  // Drop any trailing commas and a trailing 'and'/'&'
  s = s.replace(/[,:;]+$/g, "").replace(/\b(?:and|&)\s*$/i, "").trim();
      // If empty after cleanup, skip
      if (!s) continue;
      const key = s.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        cleaned.push(s);
      }
    }

    // 3) Compose a single concise sentence
    let enhancedDescription: string;
    if (cleaned.length === 0) {
      enhancedDescription = `A cherished memory with ${nameDisplay}.`;
    } else if (cleaned.length === 1) {
      const a = cleaned[0];
      // If phrase already includes the person's name (rare), don't add another "with {name}"
      if (new RegExp(`\\b${nameLc}\\b`, 'i').test(a)) {
        enhancedDescription = `${capitalizeFirst(a)}.`;
      } else {
        enhancedDescription = `${capitalizeFirst(a)} with ${nameDisplay}.`;
      }
    } else {
      const a = cleaned[cleaned.length - 2];
      const b = cleaned[cleaned.length - 1];
      // Join last two unique activities for freshness
      const body = `${a} and ${b}`;
      if (new RegExp(`\\b${nameLc}\\b`, 'i').test(body)) {
        enhancedDescription = `${capitalizeFirst(body)}.`;
      } else {
        enhancedDescription = `${capitalizeFirst(body)} with ${nameDisplay}.`;
      }
    }

    res.json({ enhancedDescription });
  } catch (error) {
    console.error('Enhanced description error:', error);
    res.status(500).json({ error: 'Failed to generate enhanced description' });
  }
});

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Photo upload endpoint
app.post("/api/upload-photo", upload.single('photo'), async (req, res) => {
>>>>>>> 7295fd0c1b7276726599b9d72f6c253d5e0f38c8
  try {
    const { name, relation, photoDescription } = req.body;
    const file = req.file;

    if (!file || !name || !relation || !photoDescription) {
      return res
        .status(400)
        .json({ error: "Missing required fields: photo, name, relation, photoDescription" });
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

// ---------- New "people" API (mounted from /routes/people) ----------
// Initialize the people router with Firestore collection
if (peopleCol) {
  initializePeopleRouter(peopleCol);
}
app.use(peopleRouter); // defines POST /api/people

// ---------- CV gallery export endpoint ----------
app.get("/cv/gallery/export", async (_req, res) => {
  if (!ensureFirestore(res)) return;
  try {
    const snap = await peopleCol!.get();
    const people: Array<{ id: string; name: string; relationship: string; embedding: number[] }> =
      [];
    snap.forEach((doc) => {
      const d = doc.data() as any;
      // Support both new embeddings.centroid format and legacy embedding format
      let embedding: number[] | null = null;
      if (d.embeddings?.centroid && Array.isArray(d.embeddings.centroid) && d.embeddings.centroid.length === 512) {
        embedding = d.embeddings.centroid.map((x: any) => Number(x));
      } else if (Array.isArray(d.embedding) && d.embedding.length === 512) {
        embedding = d.embedding.map((x: any) => Number(x));
      }
      
      if (embedding) {
        people.push({
          id: d.id,
          name: d.name,
          relationship: d.relationship || "",
          embedding,
        });
      }
    });
    return res.json({ people });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// ---------- Frontend API endpoints ----------
app.get("/api/people/list", async (_req, res) => {
  if (!ensureFirestore(res)) return;
  try {
    const snap = await peopleCol!.get();
    const people: Array<{ 
      id: string; 
      name: string; 
      relationship: string; 
      activity: string;
      imageUrls: string[];
      createdAt: any;
    }> = [];
    
    snap.forEach((doc) => {
      const d = doc.data() as any;
      people.push({
        id: d.id,
        name: d.name,
        relationship: d.relationship || "",
        activity: d.activity || "",
        imageUrls: d.imageUrls || [],
        createdAt: d.createdAt,
      });
    });
    
    return res.json({ people });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Endpoint for AR overlay to fetch person data by name
app.get("/api/memories", async (req, res) => {
  if (!ensureFirestore(res)) return;
  try {
    const { personId } = req.query as { personId?: string };
    
    if (!personId) {
      return res.status(400).json({ error: "personId query parameter required" });
    }

    // Find person by name (case-insensitive)
    const snap = await peopleCol!.get();
    let foundPerson: any = null;
    
    snap.forEach((doc) => {
      const d = doc.data() as any;
      if (d.name && d.name.toLowerCase() === personId.toLowerCase()) {
        foundPerson = d;
      }
    });

    if (!foundPerson) {
      return res.status(404).json({ error: "Person not found" });
    }

    // Return data in format expected by AR overlay
    const response = {
      item: {
        caption: foundPerson.activity || `A favorite memory with ${foundPerson.name}.`,
        relationship: foundPerson.relationship || "",
        photoUrls: foundPerson.imageUrls || [],
        photos: foundPerson.imageUrls || [],
        photoUrl: foundPerson.imageUrls?.[foundPerson.imageUrls.length - 1] || null,
      }
    };

    return res.json(response);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// ---------- Listen ----------
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
