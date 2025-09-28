import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables - this works from any computer
dotenv.config({ path: path.join(process.cwd(), '.env') });

// Debug the path resolution
console.log('Current __dirname:', __dirname);
console.log('Resolved .env path:', path.resolve(__dirname, '../../.env'));

// Debug: Check if environment variables are loaded
console.log('Checking Firebase environment variables:');
console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? '✓ Set' : '✗ Missing');
console.log('FIREBASE_PRIVATE_KEY:', process.env.FIREBASE_PRIVATE_KEY ? '✓ Set' : '✗ Missing');
console.log('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL ? '✓ Set' : '✗ Missing');

// Firebase REST API configuration
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Simple JWT token generation for service account authentication
import { sign } from 'jsonwebtoken';

async function getAccessToken(): Promise<string> {
    try {
        // Use Google's OAuth2 service with a simpler approach
        const now = Math.floor(Date.now() / 1000);
        
        // Create the assertion payload
        const header = {
            alg: 'RS256',
            typ: 'JWT'
        };
        
        const payload = {
            iss: process.env.FIREBASE_CLIENT_EMAIL,
            scope: 'https://www.googleapis.com/auth/datastore',
            aud: 'https://oauth2.googleapis.com/token',
            exp: now + 3600, // 1 hour
            iat: now
        };

        let privateKey = process.env.FIREBASE_PRIVATE_KEY;
        if (!privateKey) {
            throw new Error('Firebase private key not found in environment variables');
        }
        
        // Clean up the private key format
        privateKey = privateKey.replace(/^"|"$/g, ''); // Remove surrounding quotes
        privateKey = privateKey.replace(/\\n/g, '\n'); // Convert \n to actual newlines
        
        console.log('🔧 Private key debug info:', {
            hasBeginMarker: privateKey.includes('-----BEGIN PRIVATE KEY-----'),
            hasEndMarker: privateKey.includes('-----END PRIVATE KEY-----'),
            keyLength: privateKey.length,
            firstChars: privateKey.substring(0, 50),
            lastChars: privateKey.substring(privateKey.length - 50)
        });

        // Create JWT token manually to debug
        const jwt = sign(payload, privateKey, { 
            algorithm: 'RS256',
            header: header
        });
        
        console.log('🔧 JWT token created successfully, length:', jwt.length);

        // Exchange JWT for access token
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: jwt
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ OAuth2 token request failed:', response.status, errorText);
            throw new Error(`Token request failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json() as { access_token: string };
        console.log('✅ Access token obtained successfully');
        return data.access_token;
    } catch (error) {
        console.error('❌ Error getting access token:', error);
        throw error;
    }
}

console.log('✓ Firebase REST API service initialized successfully');

export async function addPhotoEntry(
    name: string,
    relation: string,
    photoDescription: string,
    photoURL: string
): Promise<string> {
    try {
        console.log('🔥 Starting Firestore REST API save...');
        
        const accessToken = await getAccessToken();
        
        // Create person document first
        const personDocUrl = `${FIRESTORE_BASE_URL}/people/${name}`;
        const personData = {
            fields: {
                relation: { stringValue: relation },
                updatedAt: { timestampValue: new Date().toISOString() },
                createdAt: { timestampValue: new Date().toISOString() }
            }
        };

        // Update person document (merge = true)
        const personResponse = await fetch(`${personDocUrl}?updateMask.fieldPaths=relation&updateMask.fieldPaths=updatedAt`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(personData)
        });

        if (!personResponse.ok) {
            // If person doesn't exist, create it
            if (personResponse.status === 404) {
                const createPersonResponse = await fetch(personDocUrl, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(personData)
                });
                
                if (!createPersonResponse.ok) {
                    throw new Error(`Failed to create person document: ${createPersonResponse.statusText}`);
                }
            } else {
                throw new Error(`Failed to update person document: ${personResponse.statusText}`);
            }
        }

        // Add photo to subcollection
        const photosCollectionUrl = `${FIRESTORE_BASE_URL}/people/${name}/photos`;
        const photoData = {
            fields: {
                photoDescription: { stringValue: photoDescription },
                photoURL: { stringValue: photoURL },
                uploadedAt: { timestampValue: new Date().toISOString() }
            }
        };

        const photoResponse = await fetch(photosCollectionUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(photoData)
        });

        if (!photoResponse.ok) {
            throw new Error(`Failed to add photo: ${photoResponse.statusText}`);
        }

        const photoResult = await photoResponse.json() as any;
        const photoId = photoResult.name.split('/').pop(); // Extract document ID from full path
        
        console.log(`✅ Photo entry added successfully with ID: ${photoId}`);
        return photoId;

    } catch (error) {
        console.error("❌ Error adding photo entry:", error);
        throw error;
    }
}

//Function to get all photos for a specific person, returns an array of 
export async function getPhotosForPerson(name: string): Promise<any[]> {
    try {
        console.log(`🔍 Getting photos for person: ${name}`);
        
        const accessToken = await getAccessToken();
        const photosCollectionUrl = `${FIRESTORE_BASE_URL}/people/${name}/photos`;
        
        const response = await fetch(photosCollectionUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                console.log(`No photos found for person: ${name}`);
                return [];
            }
            throw new Error(`Failed to get photos: ${response.statusText}`);
        }

        const data = await response.json() as any;
        const photosArray: any[] = [];

        if (data.documents) {
            data.documents.forEach((doc: any) => {
                const docId = doc.name.split('/').pop();
                const fields = doc.fields;
                
                photosArray.push({
                    id: docId,
                    photoDescription: fields.photoDescription?.stringValue || '',
                    photoURL: fields.photoURL?.stringValue || '',
                    uploadedAt: fields.uploadedAt?.timestampValue || null
                });
            });
        }

        console.log(`✅ Retrieved ${photosArray.length} photos for person: ${name}`);
        return photosArray;
    } catch (error) {
        console.error(`❌ Error getting photos for ${name}:`, error);
        throw error;
    }
}

// Delete a single photo document under a person
export async function deletePhoto(name: string, photoId: string): Promise<boolean> {
    try {
        const accessToken = await getAccessToken();
        const photoDocUrl = `${FIRESTORE_BASE_URL}/people/${name}/photos/${photoId}`;

        const response = await fetch(photoDocUrl, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            }
        });

        if (response.ok || response.status === 404) {
            // 404 = already deleted, treat as success for idempotency
            console.log(`🗑️ Deleted photo '${photoId}' for '${name}' (status ${response.status}).`);
            return true;
        }
        const text = await response.text();
        console.error(`❌ Failed to delete photo '${photoId}' for '${name}':`, response.status, text);
        return false;
    } catch (error) {
        console.error(`❌ Error deleting photo '${photoId}' for '${name}':`, error);
        return false;
    }
}

// Delete person: remove all photos in subcollection, then remove person doc
export async function deletePerson(name: string): Promise<boolean> {
    try {
        const accessToken = await getAccessToken();
        // List photos and delete each
        const photos = await getPhotosForPerson(name);
        let deletedCount = 0;
        for (const p of photos) {
            const ok = await deletePhoto(name, p.id);
            if (ok) deletedCount++;
        }
        console.log(`🧹 Deleted ${deletedCount}/${photos.length} photos for '${name}'.`);

        // Delete the person document itself
        const personDocUrl = `${FIRESTORE_BASE_URL}/people/${name}`;
        const response = await fetch(personDocUrl, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            }
        });

        if (response.ok || response.status === 404) {
            console.log(`🗑️ Deleted person '${name}' (status ${response.status}).`);
            return true;
        }
        const text = await response.text();
        console.error(`❌ Failed to delete person '${name}':`, response.status, text);
        return false;
    } catch (error) {
        console.error(`❌ Error deleting person '${name}':`, error);
        return false;
    }
}