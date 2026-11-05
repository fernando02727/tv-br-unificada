// Prévia ao vivo: um quadro do que está passando no canal (com o logo no canto).
// /thumb/<id>.jpg?l=<logo>  — usado no lugar da imagem dos canais sem programação.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';

const UA = 'TVBR-Unificada/1.0 (+stremio addon aggregator)';

async function get(url, headers, ms, max) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, ...headers }, signal: c.signal, redirect: 'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const reader = r.body.getReader(); const parts = []; let n = 0;
    while (n < max) { const { value, done } = await reader.read(); if (done) break; parts.push(Buffer.from(value)); n += value.length; }
    try { c.abort(); } catch {}
    return { buf: Buffer.concat(parts), url: r.url || url };
  } finally { clearTimeout(t); }
}
const rel = (b, u) => new URL(u, b).toString();

// devolve um pedaço de vídeo (TS) do momento atual
async function liveChunk(s) {
  const h = s.behaviorHints?.proxyHeaders?.request || {};
  let { buf, url } = await get(s.url, h, 5000, 3 * 1024 * 1024);
  if (buf[0] === 0x47) return buf; // TS contínuo
  let txt = buf.toString('utf8');
  if (/#EXT-X-STREAM-INF/.test(txt)) { // mestre: variante mais leve, só pra prévia
    const lines = txt.split(/\r?\n/); let best = null;
    lines.forEach((l, i) => { if (l.startsWith('#EXT-X-STREAM-INF')) { const bw = +((l.match(/BANDWIDTH=(\d+)/) || [])[1] || 9e9); const u = lines.slice(i + 1).find(x => x && !x.startsWith('#')); if (u && (!best || bw < best.bw)) best = { bw, u }; } });
    if (!best) throw new Error('sem variante');
    ({ buf, url } = await get(rel(url, best.u.trim()), h, 4000, 512 * 1024)); txt = buf.toString('utf8');
  }
  const segs = txt.split(/\r?\n/).filter(l => l && !l.startsWith('#'));
  if (!segs.length) throw new Error('sem segmentos');
  const seg = await get(rel(url, segs[segs.length - 1].trim()), h, 6000, 4 * 1024 * 1024);
  return seg.buf;
}

function frame(input) {
  return new Promise((ok, fail) => {
    const out = path.join(os.tmpdir(), `f${process.pid}${Date.now()}.jpg`);
    const p = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-skip_frame', 'nokey', '-i', input, '-map', '0:v:0', '-an', '-sn', '-dn', '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', out]);
    const t = setTimeout(() => p.kill('SIGKILL'), 7000);
    p.on('close', code => { clearTimeout(t); if (code === 0 && fs.existsSync(out)) { const b = fs.readFileSync(out); fs.rmSync(out, { force: true }); ok(b); } else fail(new Error('ffmpeg ' + code)); });
  });
}

export default async function handler(req, res) {
  const u = new URL(req.url, 'http://x');
  const id = decodeURIComponent((u.pathname.match(/\/thumb\/(.+?)\.jpg$/) || [])[1] || u.searchParams.get('id') || '');
  const logo = u.searchParams.get('l');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  try {
    const list = await (await fetch(`https://${host}/stream/tv/${encodeURIComponent(id)}.json`)).json();
    let img = null, lastErr = null;
    for (const s of (list.streams || []).slice(0, 3)) {
      try {
        const chunk = await liveChunk(s);
        const tmp = path.join(os.tmpdir(), `c${process.pid}${Date.now()}.ts`);
        fs.writeFileSync(tmp, chunk);
        try { img = await frame(tmp); } finally { fs.rmSync(tmp, { force: true }); }
        if (img) break;
      } catch (e) { lastErr = e; }
    }
    if (!img) throw lastErr || new Error('sem stream');
    let pic = sharp(img).resize(640, 360, { fit: 'cover' });
    if (logo) {
      try {
        const lb = Buffer.from(await (await fetch(logo, { headers: { 'user-agent': UA } })).arrayBuffer());
        const badge = await sharp(lb).resize(150, 90, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
        const plate = await sharp({ create: { width: 170, height: 106, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.55 } } })
          .composite([{ input: badge, top: 8, left: 10 }]).png().toBuffer();
        pic = pic.composite([{ input: plate, top: 14, left: 14 }]);
      } catch {}
    }
    const out = await pic.jpeg({ quality: 72 }).toBuffer();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=1200');
    return res.status(200).send(out);
  } catch (e) {
    // sem prévia: logo centralizado num quadro 16:9 (mantém o formato do card)
    if (logo) {
      try {
        const lb = Buffer.from(await (await fetch(logo, { headers: { 'user-agent': UA } })).arrayBuffer());
        const l = await sharp(lb).resize(300, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
        const out = await sharp({ create: { width: 640, height: 360, channels: 3, background: { r: 22, g: 26, b: 34 } } }).composite([{ input: l, gravity: 'center' }]).jpeg({ quality: 75 }).toBuffer();
        res.setHeader('Content-Type', 'image/jpeg'); res.setHeader('Cache-Control', 'public, s-maxage=180');
        return res.status(200).send(out);
      } catch {}
      res.setHeader('Cache-Control', 'public, s-maxage=120'); res.writeHead(302, { Location: logo }); return res.end();
    }
    return res.status(404).send('sem prévia: ' + e.message);
  }
}
