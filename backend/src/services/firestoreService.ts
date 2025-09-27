import * as admin from 'firebase-admin';

const serviceAccount = require('../config/memorai-66fab-firebase-adminsdk-fbsvc-0461e70293.json');

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