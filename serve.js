const http = require('http');
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
http.createServer((req, res) => {
  const url = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.join(dir, url);
  const ext = path.extname(file);
  fs.access(file, fs.constants.F_OK, err => {
    if (err) { res.writeHead(200, { 'Content-Type': 'text/html' }); fs.createReadStream(path.join(dir, 'index.html')).pipe(res); return; }
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}).listen(3000, () => console.log('Serving on http://localhost:3000'));
