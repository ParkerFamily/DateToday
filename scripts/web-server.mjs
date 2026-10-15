// Serves datetd.com from the web build (dist/) on Replit. Shared links (/invite/<code>) get a
// branded landing page, /.well-known/ has the Universal Links / App Links files, real files are
// served as-is, and every other path gets index.html so the app routes on the client.
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

const shareLinks = createRequire(import.meta.url)('../functions/shareLinks.js');

const root = path.resolve(process.argv[2] || 'dist');
const port = Number(process.env.PORT) || 3000;
const index = path.join(root, 'index.html');

const WELL_KNOWN = {
  '/.well-known/apple-app-site-association': JSON.stringify(shareLinks.appleAppSiteAssociation()),
  '/.well-known/assetlinks.json': JSON.stringify(shareLinks.assetLinks()),
};

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
    const url = new URL(req.url || '/', 'http://localhost');
    const urlPath = url.pathname;
    const send = (type, cache, body) => {
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    if (WELL_KNOWN[urlPath]) return send('application/json', 'public, max-age=3600', WELL_KNOWN[urlPath]);
    const landing = shareLinks.landingPageFor(urlPath, url.searchParams, req.headers['user-agent']);
    if (landing) return send('text/html; charset=utf-8', 'private, max-age=300', landing);

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
