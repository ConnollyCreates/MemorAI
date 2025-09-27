import { NextRequest, NextResponse } from 'next/server';

//import backend function
import { uploadPhotoWithMetadata, PhotoUploadData, PhotoUploadResult } from '../../../../backend/src/services/photoService';

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

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Call your actual backend service
    const result = await uploadPhotoWithMetadata({
      name,
      relation,
      photoDescription,
      photoBuffer: buffer
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Photo uploaded successfully',
        photoUrl: result.photoUrl,
        firestoreId: result.firestoreId
      });
    } else {
      return NextResponse.json(
        { error: result.error || 'Upload failed' }, 
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Upload API error:', error);
    return NextResponse.json(
      { error: 'Internal server error during upload' }, 
      { status: 500 }
    );
  }
}