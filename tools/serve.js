/* Tiny static file server used only for local verification.
   Usage: node tools/serve.js [port] [root]                                */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.argv[2] || 5599);
const root = path.resolve(process.argv[3] || path.join(__dirname, '..'));

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8'
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.log('404 ' + urlPath);
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
      return;
    }
    console.log('200 ' + urlPath);
    res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => {
  console.log('serving ' + root + ' on http://127.0.0.1:' + port + '/');
});
