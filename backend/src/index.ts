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
