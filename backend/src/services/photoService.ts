// Photo Upload Helper Service
// This service coordinates between Azure Blob Storage and Firestore
// Handles the complete photo upload workflow: Buffer -> Azure -> Firestore

// Import Azure storage functions
import { uploadPhotoAndGetUrl, testAzureConnection } from './storage';

// Import Firestore functions  
import { addPhotoEntry, getPhotosForPerson } from './firestoreService';

// Types for our helper functions
export interface PhotoUploadData {
    name: string;
    relation: string;
    photoDescription: string;
    photoBuffer: Buffer;
}

export interface PhotoUploadResult {
    success: boolean;
    photoUrl?: string;
    firestoreId?: string;
    error?: string;
}

export async function uploadPhotoWithMetadata(data: PhotoUploadData): Promise<PhotoUploadResult> {
    try{
        // Normalize name to lowercase for consistent storage across Azure and Firestore
        const normalizedName = data.name.toLowerCase();

        //Url to where image is stored in Azure Blob Storage
        const photoUrl = await uploadPhotoAndGetUrl(data.photoBuffer, normalizedName);
        if(!photoUrl){
            return { success: false, error: "Failed to upload photo to Azure" };
        }

        // Try Firestore save with simplified authentication
        console.log('Attempting Firestore save with simplified auth...');
        try {
            const photoID = await addPhotoEntry(normalizedName, data.relation, data.photoDescription, photoUrl);
            console.log('✓ Firestore save successful!');
            return { 
                success: true, 
                photoUrl: photoUrl, 
                firestoreId: photoID
            };
        } catch (firestoreError) {
            console.log('⚠️ Firestore save failed, but Azure upload succeeded');
            console.error('Firestore error:', firestoreError);
            // Return success with Azure URL even if Firestore fails
            return { 
                success: true, 
                photoUrl: photoUrl, 
                firestoreId: 'firestore-failed',
                error: 'Photo saved to Azure but Firestore save failed'
            };
        }
    }
    catch(error){
        return {
            success: false,
            error: `Upload failed: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}