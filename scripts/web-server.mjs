// Serves the web build (dist/) for Replit. Real files are served as-is; every other path gets
// index.html so app links like /chat/<id> load the app, which then routes on the client.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'dist');
const port = Number(process.env.PORT) || 3000;
const index = path.join(root, 'index.html');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

function fileFor(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const abs = path.join(root, path.normalize(decoded));
  if (!abs.startsWith(root + path.sep)) return null;
  try {
    return fs.statSync(abs).isFile() ? abs : null;
  } catch {
    return null;
  }
}

http
  .createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];
    const file = fileFor(urlPath);
    const target = file || index;
    const hashed = Boolean(file) && urlPath.startsWith('/_expo/');
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(target).on('error', () => res.end()).pipe(res);
  })
  .listen(port, '0.0.0.0', () => console.log(`DateToday web on http://0.0.0.0:${port}`));
