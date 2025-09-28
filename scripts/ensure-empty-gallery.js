// Ensure cv-service/gallery.json starts empty for dev rebuild
const fs = require('fs');
const path = require('path');

try {
	const target = path.join(process.cwd(), 'cv-service', 'gallery.json');
	const payload = JSON.stringify({ people: [] });
	fs.writeFileSync(target, payload, 'utf-8');
	console.log('[predev] reset cv-service/gallery.json to empty');
} catch (e) {
	console.log('[predev] failed to reset gallery.json:', e);
}
