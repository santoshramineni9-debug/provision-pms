const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = { '.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.mp4':'video/mp4','.svg':'image/svg+xml' };

http.createServer((req, res) => {
  let url = req.url === '/' ? '/index.html' : req.url;
  const file = path.join(__dirname, url);
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('Not found'); return; }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(3001, () => console.log('Website running at http://localhost:3001'));
