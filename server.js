const express = require('express');
const path = require('path');
const scraper = require('./2rmdv4.js');

const app = express();
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;

// --- cache lagu yang sudah di-resolve (biar tidak fetch spotidown tiap kali)
const songCache = new Map();
const TTL = 1000 * 60 * 30; // 30 menit

function cacheGet(k) {
  const e = songCache.get(k);
  if (!e) return null;
  if (Date.now() - e.t > TTL) { songCache.delete(k); return null; }
  return e.v;
}
function cacheSet(k, v) { songCache.set(k, { v, t: Date.now() }); }

app.use(express.static(path.join(__dirname, 'public')));

// ---------- Ikon (diambil dari catbox lewat server, di-cache di memori) ----------
const ICON_URL = 'https://files.catbox.moe/9yr2mv.jpg';
let iconBuf = null;
app.get('/api/icon', async (req, res) => {
  try {
    if (!iconBuf) {
      const r = await fetch(ICON_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' } });
      if (!r.ok) throw new Error('icon ' + r.status);
      iconBuf = Buffer.from(await r.arrayBuffer());
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(iconBuf);
  } catch (e) { res.status(502).end(); }
});

// ---------- API ----------
app.get('/api/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const type = String(req.query.type || 'song').toLowerCase();
    if (!q) return res.status(400).json({ status: false, error: 'Query wajib diisi' });
    res.json(await scraper.search(q, type, 24));
  } catch (e) { res.status(500).json({ status: false, error: e.message }); }
});

app.get('/api/song', async (req, res) => {
  try {
    const id = String(req.query.id || '').trim();
    if (!id) return res.status(400).json({ status: false, error: 'id wajib' });
    const cached = cacheGet(id);
    if (cached) return res.json(cached);
    const data = await scraper.song(id);
    cacheSet(id, data);
    res.json(data);
  } catch (e) { res.status(500).json({ status: false, error: e.message }); }
});

app.get('/api/album', async (req, res) => {
  try { res.json(await scraper.album(String(req.query.id || '').trim())); }
  catch (e) { res.status(500).json({ status: false, error: e.message }); }
});

app.get('/api/artist', async (req, res) => {
  try { res.json(await scraper.artist(String(req.query.id || '').trim())); }
  catch (e) { res.status(500).json({ status: false, error: e.message }); }
});

app.get('/api/playlist', async (req, res) => {
  try { res.json(await scraper.playlist(String(req.query.url || '').trim())); }
  catch (e) { res.status(500).json({ status: false, error: e.message }); }
});

// ---------- Proxy stream audio (biar bisa seek + bypass referer check) ----------
app.get('/api/stream', async (req, res) => {
  try {
    const url = String(req.query.url || '');
    if (!/^https?:\/\//i.test(url)) return res.status(400).end();

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': new URL(url).origin + '/'
    };
    if (req.headers.range) headers['Range'] = req.headers.range;

    const upstream = await fetch(url, { headers, redirect: 'follow' });
    res.status(upstream.status);

    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (!upstream.body) return res.end();
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) {
        await new Promise(r => res.once('drain', r));
      }
    }
    res.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).end();
    else res.end();
  }
});

app.listen(PORT, () => {
  console.log(`\n🎵 ZaRyn Music → http://localhost:${PORT}\n`);
});