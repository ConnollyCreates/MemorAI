#!/bin/bash

# MemoryAR MVP Acceptance Tests
# Run these tests to verify the complete flow works

echo "🧪 MemoryAR MVP Acceptance Tests"
echo "================================"

# Test 1: CV Health Check
echo ""
echo "1️⃣ Testing CV Service Health..."
curl -s http://127.0.0.1:8000/health | jq '.' || echo "❌ CV service not responding"

# Test 2: CV Embed Test (requires test image)
echo ""
echo "2️⃣ Testing CV Embed Endpoint..."
if [ -f "test.jpg" ]; then
    curl -s -F image=@test.jpg http://127.0.0.1:8000/embed | jq '.' || echo "❌ CV embed failed"
else
    echo "⚠️  Skipping embed test - no test.jpg found"
fi

# Test 3: Backend Health Check
echo ""
echo "3️⃣ Testing Backend Health..."
curl -s http://127.0.0.1:4000/health | jq '.' || echo "❌ Backend not responding"

# Test 4: Enroll Person (requires test images)
echo ""
echo "4️⃣ Testing Person Enrollment..."
if [ -f "a1.jpg" ] && [ -f "a2.jpg" ] && [ -f "a3.jpg" ]; then
    curl -s -X POST http://127.0.0.1:4000/api/people \
        -F "name=Alice" \
        -F "relationship=Friend" \
        -F "activity=Hiking" \
        -F "files=@a1.jpg" \
        -F "files=@a2.jpg" \
        -F "files=@a3.jpg" | jq '.' || echo "❌ Enrollment failed"
else
    echo "⚠️  Skipping enrollment test - need a1.jpg, a2.jpg, a3.jpg"
fi

# Test 5: Gallery Export
echo ""
echo "5️⃣ Testing Gallery Export..."
curl -s http://127.0.0.1:4000/cv/gallery/export | jq '.' || echo "❌ Gallery export failed"

# Test 6: CV Gallery Sync
echo ""
echo "6️⃣ Testing CV Gallery Sync..."
curl -s -X POST http://127.0.0.1:8000/gallery/sync | jq '.' || echo "❌ Gallery sync failed"

# Test 7: CV Recognition Test (requires test frame)
echo ""
echo "7️⃣ Testing CV Recognition..."
if [ -f "frame.jpg" ]; then
    curl -s -F image=@frame.jpg http://127.0.0.1:8000/recognize | jq '.' || echo "❌ Recognition failed"
else
    echo "⚠️  Skipping recognition test - no frame.jpg found"
fi

# Test 8: Memories API Test
echo ""
echo "8️⃣ Testing Memories API..."
curl -s "http://127.0.0.1:4000/api/memories?personId=Alice" | jq '.' || echo "❌ Memories API failed"

echo ""
echo "✅ Tests completed!"
echo ""
echo "📝 Expected Results:"
echo "   - CV health: { ok: true, people: N, faiss: true/false }"
echo "   - CV embed: { ok: true, embedding: [512 floats], bbox: [...] }"
echo "   - Backend health: { ok: true, service: 'backend', cv: 'http://...', people: N }"
echo "   - Enrollment: { ok: true, id: '...', imageUrls: [3 URLs] }"
echo "   - Gallery export: { people: [{ id, name, relationship, embedding: [512] }] }"
echo "   - Gallery sync: { ok: true, people: N, source: 'backend' }"
echo "   - Recognition: { detections: [{ bbox: [...], name: 'Alice', conf: 0.XX }] }"
echo "   - Memories: { item: { caption: '...', relationship: '...', photoUrls: [...] } }"
