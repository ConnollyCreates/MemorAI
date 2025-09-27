import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('photo') as File;
    const name = formData.get('name') as string;
    const relation = formData.get('relation') as string;
    const photoDescription = formData.get('photoDescription') as string;

    // Validate required fields
    if (!file || !name || !relation || !photoDescription) {
      return NextResponse.json(
        { error: 'Missing required fields: photo, name, relation, and photoDescription are all required' }, 
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'File must be an image' }, 
        { status: 400 }
      );
    }

    // Validate file size (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size must be less than 5MB' }, 
        { status: 400 }
      );
    }

    console.log('Processing upload:', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      name,
      relation,
      photoDescription
    });

    // Create FormData to send to backend
    const backendFormData = new FormData();
    backendFormData.append('photo', file);
    backendFormData.append('name', name);
    backendFormData.append('relation', relation);
    backendFormData.append('photoDescription', photoDescription);

    // Call backend API
    const backendResponse = await fetch('http://localhost:4000/api/upload-photo', {
      method: 'POST',
      body: backendFormData, // Don't set Content-Type, let browser set it with boundary
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      console.error('Backend response error:', errorText);
      return NextResponse.json(
        { error: `Backend error: ${errorText}` }, 
        { status: backendResponse.status }
      );
    }

    const result = await backendResponse.json();

    return NextResponse.json({
      success: true,
      message: 'Photo uploaded successfully',
      data: result.data
    });

  } catch (error) {
    console.error('Upload API error:', error);
    return NextResponse.json(
      { error: 'Internal server error during upload' }, 
      { status: 500 }
    );
  }
}