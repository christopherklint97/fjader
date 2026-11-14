// Static server for the production build, laid out like the phone demo host:
//   /b/...      no special headers
//   /coi/b/...  Cross-Origin-Opener-Policy: same-origin + Cross-Origin-Embedder-Policy: require-corp
// Usage: node serve.mjs [port]   (binds 127.0.0.1; default port 4173)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), process.env.SPIKE_DIST || 'dist');
const port = Number(process.argv[2] || process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    const coi = p.startsWith('/coi/');
    if (coi) p = p.slice(4);
    if (p === '/' || p === '/b') {
      res.writeHead(302, { Location: (coi ? '/coi' : '') + '/b/' }).end();
      return;
    }
    if (!p.startsWith('/b/')) {
      res.writeHead(404).end('not found');
      return;
    }
    let file = path.normalize(path.join(root, p.slice(3)));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if (file.endsWith(path.sep) || file === root) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404).end('not found');
        return;
      }
      const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
      if (coi) {
        headers['Cross-Origin-Opener-Policy'] = 'same-origin';
        headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
        headers['Cross-Origin-Resource-Policy'] = 'same-origin';
      }
      res.writeHead(200, headers).end(data);
    });
  })
  .listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/b/  and  http://127.0.0.1:${port}/coi/b/`));
