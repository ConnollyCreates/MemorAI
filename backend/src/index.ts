import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from 'dotenv';
import { uploadPhotoWithMetadata } from "./services/photoService";

// Load environment variables
dotenv.config();

const app = express();
const upload = multer();
app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

// Root + health
app.get("/", (_, res) => res.json({ ok: true, service: "backend" }));
app.get("/health", (_, res) => res.json({ ok: true, service: "backend" }));

// Minimal /memories stub (replace with DB later)
app.get("/memories", (req, res) => {
  const personId = String(req.query.personId ?? "Unknown");
  res.json({
    item: {
      personId,
      caption: `A favorite memory with ${personId}.`,
      tags: ["family", "outdoor"],
      isPinned: true,
      why: ["pinned"]
    }
  });
});

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
  try {
    console.log('Backend received upload request:', {
      body: req.body,
      file: req.file ? { name: req.file.originalname, size: req.file.size } : null
    });

    const { name, relation, photoDescription } = req.body;
    const file = req.file;

    // Validate required fields
    if (!file || !name || !relation || !photoDescription) {
      return res.status(400).json({
        error: 'Missing required fields: photo, name, relation, and photoDescription are all required'
      });
    }

    // Validate file type
    if (!file.mimetype.startsWith('image/')) {
      return res.status(400).json({
        error: 'File must be an image'
      });
    }

    // Validate file size (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return res.status(400).json({
        error: 'File size must be less than 5MB'
      });
    }

    // Upload to Azure Storage and save to Firestore
    const result = await uploadPhotoWithMetadata({
      name,
      relation,
      photoDescription,
      photoBuffer: file.buffer
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
          uploadedAt: new Date().toISOString()
        }
      });
    } else {
      console.error('Upload service error:', result.error);
      res.status(500).json({
        error: 'Failed to upload photo',
        details: result.error
      });
    }
  } catch (error) {
    console.error('Upload endpoint error:', error);
    res.status(500).json({ 
      error: 'Internal server error during photo upload',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
