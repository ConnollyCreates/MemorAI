// vision.ts: Helper for calling the CV service endpoints
// Prefer global fetch (Node 18+) to avoid ESM/CJS friction

const CV_SERVICE_URL = process.env.CV_SERVICE_URL || 'http://localhost:8000';

export interface SyncResult {
    ok: boolean;
    synced_names?: string[];
    errors?: any[];
    error?: string;
    status?: number;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Trigger CV service to sync gallery from Firestore.
 * Retries are added to avoid read-after-write timing issues in Firestore.
 * If expectName is provided, we verify it appears in synced_names before returning.
 */
export async function syncGalleryFromFirestore(attempts = 3, delayMs = 750, expectName?: string): Promise<SyncResult> {
    let lastResult: SyncResult = { ok: false };
    for (let i = 0; i < attempts; i++) {
        try {
            const res = await fetch(`${CV_SERVICE_URL}/sync_gallery_from_firestore`, { method: 'POST' });
            const status = (res as any).status as number | undefined;
            if (!res.ok) {
                const text = await res.text();
                console.error(`[CV sync] attempt ${i + 1}/${attempts} failed with status ${res.status}:`, text);
                lastResult = { ok: false, error: text, status };
            } else {
                const json = (await res.json()) as SyncResult;
                json.status = status;
                lastResult = json;
                const names = json.synced_names || [];
                if (!expectName || names.includes(expectName)) {
                    if (expectName) {
                        console.log(`[CV sync] '${expectName}' present after attempt ${i + 1}.`);
                    } else {
                        console.log(`[CV sync] completed on attempt ${i + 1}.`);
                    }
                    return json;
                }
                console.warn(`[CV sync] '${expectName}' not present yet (attempt ${i + 1}/${attempts}). names=`, names);
            }
        } catch (err) {
            console.error(`[CV sync] attempt ${i + 1}/${attempts} error:`, err);
            lastResult = { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
        if (i < attempts - 1) {
            await sleep(delayMs);
        }
    }
    return lastResult;
}
