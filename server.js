'use strict';

/**
 * Tiny dependency-free static file server for the NFL scoreboard app.
 * Binds to 0.0.0.0 so the Arena live preview can proxy to it.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = path.join(__dirname, 'public');

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

function serve(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache'
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const raw = (req.url || '/').split('?')[0];
  let urlPath;
  try {
    urlPath = decodeURIComponent(raw);
  } catch (e) {
    urlPath = raw;
  }

  let filePath = path.normalize(path.join(ROOT, urlPath));

  // Prevent path traversal outside the public directory.
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (urlPath === '/' || urlPath === '') {
    filePath = path.join(ROOT, 'index.html');
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      serve(res, filePath);
      return;
    }
    // Fall back to index.html for deep links.
    const index = path.join(ROOT, 'index.html');
    fs.stat(index, (err2, stat2) => {
      if (!err2 && stat2.isFile()) {
        serve(res, index);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`NFL scoreboard running at http://0.0.0.0:${PORT}`);
});
