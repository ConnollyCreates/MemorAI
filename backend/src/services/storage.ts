import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables - this works from any computer
dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Get Azure credentials from environment variables
const AZURE_STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const AZURE_STORAGE_ACCESS_KEY = process.env.AZURE_STORAGE_ACCESS_KEY;
const CONTAINER_NAME = process.env.AZURE_CONTAINER_NAME;

// Validate required environment variables
if (!AZURE_STORAGE_ACCOUNT_NAME || !AZURE_STORAGE_ACCESS_KEY) {
    throw new Error('Missing required Azure Storage credentials in environment variables');
}

// Create credential and service client
const credential = new StorageSharedKeyCredential(AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCESS_KEY);
const blobServiceClient = new BlobServiceClient(
    `https://${AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
    credential
);

export async function uploadPhotoAndGetUrl(buffer: Buffer, name: string): Promise<string> {
    try{
        //container client to access blobs (photos) in that container, we have 1 container (photos)
        const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME!);
        //create original file name by appending name to current timestamp (photos have to have unique names)
        const uniquePhotoName = `${name}-${Date.now()}`;
        //create a block blob client to upload the photo
        const blockBlobClient = containerClient.getBlockBlobClient(uniquePhotoName);
        //upload the photo buffer to Azure Blob Storage
        await blockBlobClient.uploadData(buffer, {
            blobHTTPHeaders: { blobContentType: 'image/jpeg' } // Assuming JPEG, adjust as needed
        });
        //get the URL of the uploaded photo
        const photoURL = blockBlobClient.url;
        console.log(`Photo uploaded to Azure Blob Storage with URL: ${photoURL}`);
        return photoURL;
    }
    catch(error){
        console.error(`Error uploading photo to Azure Blob Storage: ${error}`);
        throw error;
    }
}

//test connection to Azure Blob Storage
export async function testAzureConnection(): Promise<boolean> {
    try {
        const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME!);
        
        // Try to get container properties - this will fail if connection is bad
        await containerClient.getProperties();
        
        console.log('Azure Blob Storage connection successful');
        console.log(`Connected to container: ${CONTAINER_NAME}`);
        return true;
        
    } catch (error) {
        console.error('Azure Blob Storage connection failed:', error);
        return false;
    }
}