// Mede a qualidade REAL de um stream ao vivo: abre a playlist, baixa o começo
// do primeiro segmento e lê a resolução direto do vídeo (SPS do H.264/H.265).
// O texto que os addons escrevem ("4K", "UHD") nem sempre é verdade.

const UA = 'TVBR-Unificada/1.0 (+stremio addon aggregator)';

async function get(url, headers, ms, maxBytes) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, ...headers }, signal: ctl.signal, redirect: 'follow' });
    const ttfb = Date.now() - t0;
    if (!r.ok) return { status: r.status, ttfb };
    const reader = r.body.getReader();
    const parts = []; let n = 0;
    while (n < maxBytes) {
      const { value, done } = await reader.read();
      if (done) break;
      parts.push(value); n += value.length;
    }
    try { ctl.abort(); } catch {}
    return { status: r.status, ttfb, buf: Buffer.concat(parts.map(p => Buffer.from(p))), len: Number(r.headers.get('content-length')) || 0, url: r.url };
  } catch (e) { return { status: 0, ttfb: Date.now() - t0, error: e.name }; }
  finally { clearTimeout(t); }
}

// --- leitura de bits para o SPS ---------------------------------------------
class Bits {
  constructor(b) { this.b = b; this.i = 0; }
  bit() { const v = (this.b[this.i >> 3] >> (7 - (this.i & 7))) & 1; this.i++; return v; }
  bits(n) { let v = 0; for (let k = 0; k < n; k++) v = v * 2 + this.bit(); return v; }
  ue() { let z = 0; while (this.bit() === 0 && z < 32) z++; return z ? (2 ** z - 1 + this.bits(z)) : 0; }
  se() { const v = this.ue(); return v & 1 ? (v + 1) / 2 : -v / 2; }
}
function unescape(nal) {
  const out = [];
  for (let i = 0; i < nal.length; i++) {
    if (i >= 2 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0) continue;
    out.push(nal[i]);
  }
  return Buffer.from(out);
}
function skipScaling(b, n) {
  let last = 8, next = 8;
  for (let j = 0; j < n; j++) { if (next !== 0) next = (last + b.se() + 256) % 256; last = next === 0 ? last : next; }
}
function h264Sps(nal) {
  const b = new Bits(unescape(nal.subarray(1)));
  const profile = b.bits(8); b.bits(8); b.bits(8); b.ue();
  if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(profile)) {
    const chroma = b.ue(); if (chroma === 3) b.bit();
    b.ue(); b.ue(); b.bit();
    if (b.bit()) for (let k = 0; k < (chroma !== 3 ? 8 : 12); k++) if (b.bit()) skipScaling(b, k < 6 ? 16 : 64);
  }
  b.ue();
  const poc = b.ue();
  if (poc === 0) b.ue();
  else if (poc === 1) { b.bit(); b.se(); b.se(); const n = b.ue(); for (let k = 0; k < n; k++) b.se(); }
  b.ue(); b.bit();
  const wMbs = b.ue() + 1, hMap = b.ue() + 1;
  const frameMbsOnly = b.bit();
  if (!frameMbsOnly) b.bit();
  b.bit();
  let cl = 0, cr = 0, ct = 0, cb = 0;
  if (b.bit()) { cl = b.ue(); cr = b.ue(); ct = b.ue(); cb = b.ue(); }
  const w = wMbs * 16 - (cl + cr) * 2;
  const h = (2 - frameMbsOnly) * hMap * 16 - (ct + cb) * 2 * (2 - frameMbsOnly);
  return { w, h, codec: 'h264' };
}
function h265Sps(nal) {
  const b = new Bits(unescape(nal.subarray(2)));
  b.bits(4); const maxSub = b.bits(3); b.bit();
  b.bits(2); b.bit(); b.bits(5); b.bits(32); b.bits(48); b.bits(8);
  const pres = [];
  for (let k = 0; k < maxSub; k++) pres.push([b.bit(), b.bit()]);
  if (maxSub > 0) for (let k = maxSub; k < 8; k++) b.bits(2);
  for (const [p, l] of pres) { if (p) b.bits(88); if (l) b.bits(8); }
  b.ue();
  const chroma = b.ue(); if (chroma === 3) b.bit();
  let w = b.ue(), h = b.ue();
  if (b.bit()) { const sx = chroma === 1 || chroma === 2 ? 2 : 1, sy = chroma === 1 ? 2 : 1; w -= (b.ue() + b.ue()) * sx; h -= (b.ue() + b.ue()) * sy; }
  return { w, h, codec: 'hevc' };
}

// payload dos pacotes TS concatenado (o SPS cabe num pacote quase sempre)
function tsPayload(buf) {
  let off = 0;
  while (off < 188 && !(buf[off] === 0x47 && buf[off + 188] === 0x47)) off++;
  if (off >= 188) return buf; // não é TS: devolve cru (pode ser fMP4/ES)
  const out = [];
  for (let p = off; p + 188 <= buf.length; p += 188) {
    if (buf[p] !== 0x47) break;
    const afc = (buf[p + 3] >> 4) & 3;
    let s = p + 4;
    if (afc === 2) continue;
    if (afc === 3) s += 1 + buf[p + 4];
    if (s < p + 188) out.push(buf.subarray(s, p + 188));
  }
  return Buffer.concat(out);
}

export function spsResolution(buf) {
  const d = tsPayload(buf);
  for (let i = 0; i + 4 < d.length; i++) {
    if (d[i] !== 0 || d[i + 1] !== 0 || d[i + 2] !== 1) continue;
    const nal = d.subarray(i + 3, Math.min(d.length, i + 3 + 300));
    try {
      if ((nal[0] & 0x1f) === 7 && (nal[0] & 0x80) === 0) { const r = h264Sps(nal); if (r.h >= 144 && r.h <= 4320) return r; }
      if (((nal[0] >> 1) & 0x3f) === 33) { const r = h265Sps(nal); if (r.h >= 144 && r.h <= 4320) return r; }
    } catch {}
  }
  return null;
}

function resolveUrl(base, rel) { try { return new URL(rel, base).toString(); } catch { return rel; } }

// Resultado: { ok, h, w, codec, kbps, ttfb }
export async function inspectStream(s, ms = 8000) {
  const headers = s.behaviorHints?.proxyHeaders?.request || {};
  const t0 = Date.now();
  const first = await get(s.url, headers, ms, 65536);
  if (!first.buf) return { ok: false, status: first.status, ttfb: first.ttfb, blocked: [401, 403, 429].includes(first.status) };
  let buf = first.buf, url = first.url || s.url, txt = buf.toString('latin1');
  const res = { ok: true, ttfb: first.ttfb };
  if (buf[0] === 0x47) { const r = spsResolution(buf); return { ...res, ...(r || {}), kind: 'ts' }; }
  if (!/#EXTM3U/.test(txt)) return { ok: false, ttfb: first.ttfb, status: 'nao-video' };
  // playlist mestre: escolhe a variante mais alta
  if (/#EXT-X-STREAM-INF/.test(txt)) {
    let best = null;
    const lines = txt.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
      const h = +((lines[i].match(/RESOLUTION=\d+x(\d+)/) || [])[1] || 0), bw = +((lines[i].match(/BANDWIDTH=(\d+)/) || [])[1] || 0);
      const u = (lines.slice(i + 1).find(l => l && !l.startsWith('#')) || '').trim();
      if (u && (!best || h > best.h || (h === best.h && bw > best.bw))) best = { h, bw, u };
    }
    if (!best) return { ok: false, ttfb: first.ttfb };
    if (best.h) { res.h = best.h; res.kbps = Math.round(best.bw / 1000); }
    const v = await get(resolveUrl(url, best.u), headers, Math.max(1500, ms - (Date.now() - t0)), 65536);
    if (!v.buf) return { ...res, ok: !!best.h, status: v.status };
    buf = v.buf; url = v.url || resolveUrl(url, best.u); txt = buf.toString('latin1');
  }
  if (!/#EXTINF/.test(txt)) return { ...res, ok: false, status: 'sem-segmentos' };
  // primeiro segmento: resolução real + taxa de bits
  const lines = txt.split(/\r?\n/);
  const di = lines.findIndex(l => l.startsWith('#EXTINF'));
  const dur = parseFloat((lines[di].match(/#EXTINF:([\d.]+)/) || [])[1] || '0');
  const seg = lines.slice(di + 1).find(l => l && !l.startsWith('#'));
  if (!seg || res.h) return res;
  const sg = await get(resolveUrl(url, seg.trim()), headers, Math.max(1500, ms - (Date.now() - t0)), 196608);
  if (!sg.buf) return { ...res, status: sg.status };
  const r = spsResolution(sg.buf);
  if (r) Object.assign(res, r);
  if (sg.len && dur) res.kbps = Math.round(sg.len * 8 / dur / 1000);
  return res;
}
