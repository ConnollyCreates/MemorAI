// Wait for backend and CV service, then trigger CV gallery sync from Firestore
// This is intended for dev: ensures cv-service/gallery.json matches Firestore on startup

const http = require('http');

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:4000';
const CV = process.env.NEXT_PUBLIC_CV_URL || 'http://127.0.0.1:8000';

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

function head(url, timeoutMs = 3000){
	return new Promise((resolve) => {
		const req = http.request(url, { method: 'GET', timeout: timeoutMs }, (res) => {
			res.resume(); // discard
			resolve(res.statusCode && res.statusCode >= 200 && res.statusCode < 500);
		});
		req.on('timeout', () => { req.destroy(); resolve(false); });
		req.on('error', () => resolve(false));
		req.end();
	});
}

async function post(url, timeoutMs = 15000){
	return new Promise((resolve) => {
		const req = http.request(url, { method: 'POST', timeout: timeoutMs }, (res) => {
			let body = '';
			res.on('data', (c)=> body += c);
			res.on('end', ()=> resolve({ ok: res.statusCode && res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body }));
		});
		req.on('timeout', () => { req.destroy(); resolve({ ok:false, status:0, body:'timeout'}); });
		req.on('error', (e) => resolve({ ok:false, status:0, body:String(e)}));
		req.end();
	});
}

(async () => {
	const deadline = Date.now() + 30000;
	let backendReady = false, cvReady = false;
	while (Date.now() < deadline) {
		backendReady = await head(`${BACKEND}/health`);
		cvReady = await head(`${CV}/health`);
		if (backendReady && cvReady) break;
		await sleep(750);
	}
	if (!backendReady || !cvReady) {
		console.log(`[auto-sync] services not ready (backend=${backendReady}, cv=${cvReady}), skipping initial sync`);
		process.exit(0);
	}
	console.log('[auto-sync] triggering Firestore→CV gallery sync...');
	const r = await post(`${CV}/sync_gallery_from_firestore`);
	if (!r.ok) {
		console.log('[auto-sync] sync failed:', r.status, r.body);
	} else {
		console.log('[auto-sync] sync ok:', r.status, r.body);
	}
})();
