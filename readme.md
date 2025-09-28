# MemoryAR MVP

A complete AR memory assistance system that enrolls people from photos and recognizes them in real-time with memory card overlays.

## Architecture

- **CV Service (FastAPI)**: Stateless embedder → `/embed` returns 512-d L2-normalized vector from raw image bytes; `/recognize` matches live frames against in-memory gallery; `/gallery/sync` pulls gallery from backend.
- **Backend (Node/Express/TS)**: Single writer. Route `POST /api/people` receives 3 files + fields, calls CV `/embed` for each, computes centroid, uploads photos to Azure, writes one doc in Firestore, then pings CV `/gallery/sync`. Also exposes `GET /cv/gallery/export` for CV to load `{people:[{id,name,relationship,embedding}]}`.
- **Frontend (Next.js)**: Caregiver page posts to `/api/people`. AR page reads Firestore people and renders memory cards as overlays when people are recognized.

## Quick Start

### 1. Environment Setup

Copy the example environment files and fill in your credentials:

```bash
# Backend
cp backend/env.example backend/.env
# Edit backend/.env with your Firebase and Azure credentials

# Frontend  
cp frontend/env.local.example frontend/.env.local
# Edit frontend/.env.local with your backend URL

# CV Service
cp cv-service/env.example cv-service/.env
# Edit cv-service/.env if you want to adjust thresholds
```

### 2. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install

# CV Service
cd ../cv-service
pip install -r requirements.txt
```

### 3. Run Services

```bash
# Terminal 1: CV Service
cd cv-service
uvicorn app:app --reload --port 8000

# Terminal 2: Backend
cd backend
npm run dev

# Terminal 3: Frontend
cd frontend
npm run dev
```

### 4. Test the Flow

1. Go to `http://localhost:3000/Caregiver`
2. Upload 3 photos + fill in name, relationship, activity
3. Click "Save & Enroll" - should see success toast
4. Go to `http://localhost:3000/ar` 
5. Point camera at the person - should see memory card overlay

## API Endpoints

### Backend
- `POST /api/people` - Enroll person with 3 photos
- `GET /cv/gallery/export` - Export people with embeddings for CV
- `GET /api/memories?personId=Name` - Get person data for AR overlay
- `GET /health` - Health check

### CV Service  
- `POST /embed` - Get embedding from image
- `POST /recognize` - Recognize faces in image
- `POST /gallery/sync` - Sync gallery from backend
- `GET /health` - Health check

## Acceptance Tests

Run the acceptance test script to verify everything works:

```bash
chmod +x acceptance-tests.sh
./acceptance-tests.sh
```

## Environment Variables

### Backend (.env)
```
PORT=4000
CV_URL=http://127.0.0.1:8000
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
AZURE_STORAGE_ACCOUNT_NAME=your-storage-account
AZURE_STORAGE_ACCESS_KEY=your-access-key
AZURE_CONTAINER_NAME=photos
```

### Frontend (.env.local)
```
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:4000
NEXT_PUBLIC_CV_URL=http://127.0.0.1:8000
NEXT_PUBLIC_AZURE_SPEECH_KEY=your-speech-key (optional)
NEXT_PUBLIC_AZURE_SPEECH_REGION=your-speech-region (optional)
```

### CV Service (.env)
```
THRESHOLD=0.60
DET_THRESHOLD=0.38
FAST_THROTTLE_MS=250
ROI_MARGIN=0.25
GALLERY_PATH=gallery.json
BACKEND_GALLERY_EXPORT=http://127.0.0.1:4000/cv/gallery/export
```

## Development

### Backend
```bash
cd backend
npm run dev          # Start with hot reload
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues
npm run format       # Format with Prettier
```

### Frontend
```bash
cd frontend
npm run dev          # Start with hot reload
npm run lint         # Run ESLint
```

## Firestore Schema

People collection documents:
```json
{
  "id": "alice__friend",
  "name": "Alice",
  "relationship": "Friend", 
  "activity": "Hiking",
  "imageUrls": ["https://...", "https://...", "https://..."],
  "embeddings": {
    "centroid": [512 floats],
    "perImage": [[512 floats], [512 floats], [512 floats]],
    "dim": 512,
    "normalized": true
  },
  "createdAt": "timestamp"
}
```

## Definition of Done

✅ From the UI, I can upload 3 photos + fields once and see a success toast.  
✅ Firestore has a people doc with centroid + imageUrls. Azure shows 3 images.  
✅ CV `/gallery/sync` loads 1+ people. `/recognize` returns the correct name on a test frame.  
✅ AR page shows a memory card overlay for each recognized person from Firestore.
