'use strict';

/**
 * Tiny dependency-free static server for local development.
 * Binds to 0.0.0.0 so the Arena live preview can proxy to it.
 *
 * The scoreboard is a fully static app — the exact same files at the repo
 * root are what GitHub Pages publishes (see _config.yml). This server simply
 * serves those app files and refuses to serve development scaffolding
 * (server.js itself, tests, package.json, dotfiles, etc.).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;

// Only the app's own assets are served; everything else is dev scaffolding.
const ALLOWED = [
  /^\/index\.html$/,
  /^\/styles\.css$/,
  /^\/app\.js$/,
  /^\/favicon\.svg$/,
  /^\/lib\/.+$/
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function notFound(res) {
  res.writeHead(404);
  res.end('Not found');
}

const server = http.createServer((req, res) => {
  const raw = (req.url || '/').split('?')[0];
  let urlPath;
  try {
    urlPath = decodeURIComponent(raw);
  } catch (e) {
    urlPath = raw;
  }

  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  const norm = path.posix.normalize(urlPath);
  if (!ALLOWED.some((re) => re.test(norm))) {
    notFound(res);
    return;
  }

  const filePath = path.join(ROOT, norm);

  // Prevent path traversal outside the repo root (defense in depth).
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      notFound(res);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`NFL scoreboard running at http://0.0.0.0:${PORT}`);
});
