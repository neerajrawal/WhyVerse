'use strict';
/**
 * Local stand-in for Vercel's /api routes:  node scripts/dev-api.js   (port 3001)
 * `npm run dev` in web/ proxies /api here. Needs the Firestore emulator or a service-account
 * key (FIREBASE_SERVICE_ACCOUNT_B64) plus the keys from .env.local in the environment.
 */
const http = require('http');
const { handleCallable, handleCron } = require('../api/_run');

const port = Number(process.env.PORT || 3001);
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const m = url.pathname.match(/^\/api\/(cron\/)?([A-Za-z0-9]+)$/);
  if (!m) { res.statusCode = 404; return res.end('{}'); }
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
  req.on('end', () => {
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
    req.query = m[1] ? { job: m[2] } : { fn: m[2] };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
    (m[1] ? handleCron : handleCallable)(req, res).catch((e) => { console.error(e); res.status(500).json({ error: { status: 'internal', message: 'error' } }); });
  });
}).listen(port, () => console.log(`API on http://localhost:${port}`));
