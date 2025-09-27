import express from "express";
import cors from "cors";

const app = express();
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

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
