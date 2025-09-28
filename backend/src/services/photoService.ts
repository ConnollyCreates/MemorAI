// Photo Upload Helper Service
// This service coordinates between Azure Blob Storage and Firestore
// Handles the complete photo upload workflow: Buffer -> Azure -> Firestore

// Import Azure storage functions
import { uploadPhotoAndGetUrl, testAzureConnection } from './storage';
import { syncGalleryFromFirestore } from './vision';

// Import Firestore functions  
const { addPhotoEntry, getPhotosForPerson } = require('./firestoreService');


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

        // Try Firestore save with REST API
        console.log('🔥 Attempting Firestore save with REST API...');
        try {
            const photoID = await addPhotoEntry(normalizedName, data.relation, data.photoDescription, photoUrl);
            console.log('✅ Firestore REST API save successful!');

            // Trigger CV service gallery sync, verify the uploaded person appears
            const syncResult = await syncGalleryFromFirestore(4, 800, normalizedName);
            if (!syncResult.ok) {
                console.warn('⚠️ CV service gallery sync reported failure after upload:', syncResult);
            } else {
                console.log('🧠 CV service gallery sync ok:', {
                    present: (syncResult.synced_names || []).includes(normalizedName),
                    names: syncResult.synced_names || [],
                    errors: syncResult.errors || []
                });
            }

            return { 
                success: true, 
                photoUrl: photoUrl, 
                firestoreId: photoID
            };
        } catch (firestoreError) {
            console.log('⚠️ Firestore REST API save failed, but Azure upload succeeded');
            console.error('Firestore REST API error:', firestoreError);
            // Return success with Azure URL even if Firestore fails
            return { 
                success: true, 
                photoUrl: photoUrl, 
                firestoreId: 'firestore-rest-failed',
                error: 'Photo saved to Azure but Firestore REST API save failed'
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