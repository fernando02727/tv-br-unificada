// Servidor local para testar: node scripts/dev-server.mjs  -> http://localhost:7000
import http from 'node:http';
import handler from '../api/index.js';
http.createServer((req, res) => {
  res.status = c => { res.statusCode = c; return res; };
  res.send = b => res.end(b);
  res.json = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
  handler(req, res);
}).listen(process.env.PORT || 7000, () => console.log('http://localhost:' + (process.env.PORT || 7000)));
