import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Firebase Admin using environment variables or JSON file
let serviceAccount;

if (process.env.FIREBASE_PRIVATE_KEY) {
    // Use environment variables (recommended for production)
    serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
    };
} else {
    // Fallback to JSON file (for local development)
    try {
        serviceAccount = require('../config/memorai-66fab-firebase-adminsdk-fbsvc-0461e70293.json');
    } catch (error) {
        throw new Error('Firebase credentials not found. Please set environment variables or add the service account JSON file.');
    }
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

export async function addPhotoEntry(
    name: string,
    relation: string,
    photoDescription: string,
    photoURL: string
): Promise<string>{
    try {
        //Creates a collection 'people' and smaller entries within the collection for each person
        const personRef = db.collection('people').doc(name);
        await personRef.set(
            {
                relation: relation,
                //Tracks updates to photoURL and stuff
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                //Tracks when person was added to database
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
        );
        //Creates a subcollection 'photos' within each person entry
        const photosRef = await personRef.collection('photos').add({
            photoDescription: photoDescription,
            photoURL: photoURL,
            uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        //Debug stuff, tells us the ID of the new photo entry
        console.log(`Photo entry added with ID: ${photosRef.id}`);
        return photosRef.id;

    }
    //Also debug stuff, tells us if there was an error adding the photo entry
    catch(error){
        console.error("Error adding photo entry: ", error);
        throw error;
    }
};

//Function to get all photos for a specific person, returns an array of 
export async function getPhotosForPerson(name: string): Promise<any[]>{
    try {
        const personRef = db.collection('people').doc(name);
        const photosSnapshot = await personRef.collection('photos').get();
        const photosArray: any[] = [];
        //Returns an object with string photo ID, string photoURL, string photoDescription, and Timestamp (Firestore object) uploadedAt
        //idk if we'll need the Firestore Timestamp object but it's here if we do
        photosSnapshot.forEach(doc => {
            photosArray.push({ id: doc.id, 
                                ...doc.data() });
        });
        console.log(`Retrieved ${photosArray.length} photos for person: ${name}`);
        return photosArray;
    } catch (error) {
        console.error(`Error getting photos for ${name}:`, error);
        throw error;
    }
};