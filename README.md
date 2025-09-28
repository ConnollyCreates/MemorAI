# MemorAI 🧠💙

**AI-powered memory assistance for Alzheimer's patients and their families**

MemorAI is a compassionate web application that uses advanced facial recognition and AI to help Alzheimer's patients identify their loved ones through real-time camera recognition, complete with voice narration and personalized memory cards.

## 🌟 Features

- **Real-time Facial Recognition**: Instant identification of family members and friends
- **Memory Cards**: Rich context cards showing relationships, recent photos, and shared activities
- **Voice Narration**: Gentle, elderly-friendly AI voice that announces recognized people
- **Caregiver Dashboard**: Easy photo upload and memory management for family members
- **Azure Integration**: Secure cloud storage and advanced AI services
- **Responsive Design**: Works seamlessly across devices

## 🏗️ Architecture

MemorAI consists of three main services:

### Frontend (Next.js)
- **AR Recognition Page**: Real-time camera feed with facial recognition overlay
- **Caregiver Dashboard**: Photo upload and memory management interface
- **Responsive UI**: Dark theme optimized for accessibility

### Backend (Node.js/Express)
- **Photo Management**: Secure upload to Azure Blob Storage
- **Firestore Integration**: Real-time database for person and memory data
- **Memory Enhancement**: AI-powered memory card generation using Gemini
- **API Endpoints**: RESTful services for all app functionality

### CV Service (Python/FastAPI)
- **Face Recognition**: InsightFace with buffalo_l model for accurate face detection
- **FAISS Search**: Lightning-fast similarity search with 512-dimensional embeddings
- **Memory Cards**: Dynamic generation of personalized memory information
- **Gallery Sync**: Automatic synchronization with Firestore database

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v16 or higher)
- **Python** (v3.8 or higher)
- **Azure Account** with Cognitive Services and Storage
- **Google Cloud Project** with Firestore enabled

### Environment Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/ConnollyCreates/MemorAI.git
   cd MemorAI
   ```

2. **Install dependencies**
   ```bash
   # Install root dependencies
   npm install
   
   # Install frontend dependencies
   cd frontend && npm install && cd ..
   
   # Install backend dependencies
   cd backend && npm install && cd ..
   
   # Install CV service dependencies
   cd cv-service
   pip install -r requirements.txt
   cd ..
   ```

3. **Environment Variables**
   
   Create `.env` files in the appropriate directories:

   **Frontend** (`frontend/.env.local`):
   ```env
   NEXT_PUBLIC_BACKEND_URL=http://localhost:5001
   NEXT_PUBLIC_CV_URL=http://localhost:8000
   AZURE_SPEECH_KEY=your_azure_speech_key
   AZURE_SPEECH_REGION=your_azure_region
   ```

   **Backend** (`backend/.env`):
   ```env
   AZURE_STORAGE_CONNECTION_STRING=your_azure_storage_connection_string
   AZURE_STORAGE_CONTAINER_NAME=memorai-photos
   GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
   GEMINI_API_KEY=your_gemini_api_key
   ```

   **CV Service** (`cv-service/.env`):
   ```env
   GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
   ```

### 🎯 Running the Application

**Option 1: Run all services at once**
```bash
npm run dev
```
This automatically:
- Clears the local gallery cache
- Starts all three services (frontend, backend, CV service)
- Waits for services to be healthy
- Syncs the gallery from Firestore

**Option 2: Run services individually**
```bash
# Terminal 1: Backend
cd backend && npm start

# Terminal 2: CV Service  
cd cv-service && python app.py

# Terminal 3: Frontend
cd frontend && npm run dev
```

### 🌐 Access Points

- **Main App**: http://localhost:3000
- **AR Recognition**: http://localhost:3000/ar
- **Caregiver Dashboard**: http://localhost:3000/caregiver
- **Backend API**: http://localhost:5001
- **CV Service**: http://localhost:8000

## 📱 Usage

### For Alzheimer's Patients
1. Visit the **AR Recognition page** (`/ar`)
2. Allow camera access when prompted
3. Point camera at family members
4. Listen to gentle voice announcements identifying people
5. View memory cards with photos and relationship context

### For Caregivers
1. Visit the **Caregiver Dashboard** (`/caregiver`)
2. Upload photos of family members
3. Add names, relationships, and activities
4. Photos are automatically processed and added to recognition database

## 🛠️ Development

### Project Structure
```
MemorAI/
├── frontend/           # Next.js frontend application
│   ├── app/           # App router pages
│   ├── components/    # Reusable React components
│   └── public/        # Static assets
├── backend/           # Node.js/Express backend
│   └── src/          # Backend source code
│       ├── routes/   # API endpoints
│       └── services/ # Business logic
├── cv-service/        # Python FastAPI service
│   ├── app.py        # Main application
│   ├── gallery.json  # Local face database cache
│   └── firestore_service.py # Database integration
└── scripts/           # Development utilities
```

### Key Scripts
- `npm run dev` - Start all services with auto-sync
- `npm run auto-sync` - Manually trigger gallery sync
- `predev` - Clear gallery cache before development

### API Endpoints

**Backend (Port 5001)**
- `POST /api/upload-photo` - Upload and process photos
- `GET /memories` - Retrieve person memories
- `POST /api/sync-cv` - Trigger CV service sync
- `POST /enhance-description` - AI-powered memory enhancement

**CV Service (Port 8000)**
- `POST /recognize_with_memory` - Face recognition with memory cards
- `POST /sync_gallery_from_firestore` - Sync face database
- `GET /health` - Service health check

## 🔒 Security & Privacy

- **Secure Storage**: Photos stored in Azure Blob Storage with access controls
- **Local Processing**: Face recognition runs locally for privacy
- **No Face Storage**: Only mathematical embeddings stored, not actual face images
- **HTTPS Ready**: Production-ready with SSL/TLS support

## 🎨 Customization

### Voice Settings
Modify voice characteristics in `frontend/app/ar/page.tsx`:
- **Speech Rate**: Adjust `rate` for speaking speed
- **Voice Selection**: Change Azure voice or browser TTS preferences
- **Pitch & Volume**: Fine-tune for comfort

### Memory Cards
Customize memory card appearance in `frontend/components/MemoryCardOverlay.tsx`:
- Colors, fonts, and layout
- Information displayed
- Animation and transitions

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 💙 Acknowledgments

- Built with love for families affected by Alzheimer's disease
- Powered by Azure Cognitive Services and Google Cloud
- Face recognition by InsightFace
- UI components by Next.js and Tailwind CSS

---

**MemorAI** - Preserving connections, one recognition at a time. 💙
