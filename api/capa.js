// Capas 16:9 (PNG 640x360) para as pastas das Coleções do Nuvio.
//   /capa/<marca>.png  -> cena de uma série/filme marcante do streaming + logo oficial
//   /capa/c.png?t=Título&s=Etiqueta&bg=<tt...|top-movie|top-series>&p=<paleta>
// Imagens: images.metahub.space (gratuito, sem chave, por IMDb id) e Cinemeta (Stremio) para "em alta".
import { ImageResponse } from '@vercel/og';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRAND_DIR = path.join(HERE, '..', 'lib');
const W = 640, H = 360;

const BRANDS = {
  netflix:     { logo: 'netflix-int.png', lw: 340, bg: 'tt4574334', tint: '#000000' },
  prime:       { logo: 'primevideo.png', lw: 300, bg: 'tt1190634', tint: '#00050d' },
  disney:      { logo: 'disney-plus-int.png', lw: 330, bg: 'tt8111088', tint: '#040a2c' },
  hbomax:      { logo: 'hbo-max-color-us.png', lw: 280, bg: 'tt11198330', tint: '#05001a' },
  apple:       { logo: 'appletv.png', lw: 200, bg: 'tt11280740', tint: '#000000', plus: true },
  globoplay:   { logo: 'globoplay.png', lw: 380, bg: 'tt2303077', tint: '#000000' },
  paramount:   { logo: 'paramount-plus-white-us.png', lw: 300, bg: 'tt4236770', tint: '#00144d' },
  crunchyroll: { logo: 'crunchyroll.png', lw: 150, bg: 'tt21209876', tint: '#1a0a00', name: 'Crunchyroll' },
  mubi:        { logo: 'mubi.png', lw: 150, bg: 'tt17526714', tint: '#000a45', name: 'MUBI' },
  claro:       { bg: null, tint: '#8f0f06', name: 'Claro tv+', pal: ['#da291c', '#5c0a04'] }
};
const PAL = {
  red: ['#7f1d1d', '#ef4444'], gold: ['#78350f', '#f59e0b'], blue: ['#0c1e4a', '#2563eb'], purple: ['#2e1065', '#9333ea'],
  green: ['#052e16', '#16a34a'], teal: ['#042f2e', '#0d9488'], pink: ['#500724', '#db2777'], gray: ['#0f172a', '#475569'],
  orange: ['#431407', '#ea580c'], cyan: ['#083344', '#0891b2'], black: ['#000000', '#262626'], lime: ['#1a2e05', '#65a30d']
};

async function get(url, ms = 6000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, redirect: 'follow' }); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); }
  catch { return null; } finally { clearTimeout(t); }
}
// fundo: IMDb id -> backdrop do metahub; "top-movie"/"top-series" -> 1º em alta no Cinemeta
async function backdrop(bg) {
  if (!bg) return null;
  let id = bg;
  if (/^top-(movie|series)$/.test(bg)) {
    const j = await get(`https://cinemeta-catalogs.strem.io/top/catalog/${bg.slice(4)}/top.json`);
    try { id = JSON.parse(j).metas.find(m => /^tt\d+$/.test(m.id)).id; } catch { return null; }
  }
  if (!/^tt\d+$/.test(id)) return null;
  const b = await get(`https://images.metahub.space/background/medium/${id}/img`);
  if (!b) return null;
  try { return 'data:image/jpeg;base64,' + (await sharp(b).resize(W, H, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer()).toString('base64'); }
  catch { return null; }
}
async function logoData(file, w) {
  let raw = null;
  try { raw = fs.readFileSync(path.join(BRAND_DIR, file)); } catch {}
  if (!raw) raw = await get('https://raw.githubusercontent.com/fernando02727/tv-br-unificada/main/lib/' + file);
  if (!raw) return null;
  const b = await sharp(raw).trim().resize({ width: w * 2, height: 220, fit: 'inside' }).png().toBuffer();
  const m = await sharp(b).metadata();
  return { src: 'data:image/png;base64,' + b.toString('base64'), w: Math.round(m.width / 2), h: Math.round(m.height / 2) };
}

const el = (type, style, children) => ({ type, props: { style, children } });
const layer = (style, children) => el('div', { position: 'absolute', top: 0, left: 0, width: W, height: H, display: 'flex', ...style }, children);

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const slug = (url.pathname.split('/').pop() || '').replace(/\.png$/, '');
  const b = BRANDS[slug];
  const layers = [];
  if (b) {
    const bg = await backdrop(b.bg);
    const [c1, c2] = b.pal || [b.tint, '#000000'];
    layers.push(layer({ background: `linear-gradient(135deg, ${c1}, ${c2})` }, null));
    if (bg) layers.push({ type: 'img', props: { src: bg, width: W, height: H, style: { position: 'absolute', top: 0, left: 0 } } });
    layers.push(layer({ background: `linear-gradient(180deg, ${b.tint}55 0%, ${b.tint}cc 60%, ${b.tint}f2 100%)` }, null));
    const kids = [];
    if (b.logo) { const l = await logoData(b.logo, b.lw).catch(() => null); if (l) kids.push({ type: 'img', props: { src: l.src, width: l.w, height: l.h } }); }
    if (b.plus) kids.push(el('div', { fontSize: 96, color: '#fff', marginLeft: 6, display: 'flex' }, '+'));
    if (b.name) kids.push(el('div', { fontSize: b.logo ? 54 : 88, color: '#fff', marginLeft: b.logo ? 18 : 0, display: 'flex' }, b.name));
    layers.push(layer({ alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }, kids));
  } else {
    const t = (url.searchParams.get('t') || 'Filmes').slice(0, 40);
    const s = (url.searchParams.get('s') || '').slice(0, 50);
    const [c1, c2] = PAL[url.searchParams.get('p')] || PAL.gray;
    const bg = await backdrop(url.searchParams.get('bg'));
    const size = t.length <= 10 ? 80 : t.length <= 16 ? 64 : t.length <= 24 ? 50 : 40;
    layers.push(layer({ background: `linear-gradient(135deg, ${c1}, ${c2})` }, null));
    if (bg) {
      layers.push({ type: 'img', props: { src: bg, width: W, height: H, style: { position: 'absolute', top: 0, left: 0 } } });
      layers.push(layer({ background: `linear-gradient(90deg, ${c1}f0 0%, ${c1}b0 45%, ${c1}10 100%)` }, null));
      layers.push(layer({ background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.75) 100%)' }, null));
    }
    layers.push(layer({ flexDirection: 'column', justifyContent: 'flex-end', padding: '36px 40px', color: '#fff' }, [
      s ? el('div', { fontSize: 24, opacity: 0.9, textTransform: 'uppercase', letterSpacing: 3, marginBottom: 6, display: 'flex' }, s) : null,
      el('div', { fontSize: size, fontWeight: 700, lineHeight: 1.05, display: 'flex', maxWidth: 520, textShadow: '0 2px 12px rgba(0,0,0,0.6)' }, t),
      el('div', { width: 84, height: 7, background: '#fff', borderRadius: 4, marginTop: 16, display: 'flex' }, null)
    ].filter(Boolean)));
  }
  const img = new ImageResponse(el('div', { width: W, height: H, display: 'flex', position: 'relative', background: '#000' }, layers), { width: W, height: H });
  const buf = Buffer.from(await img.arrayBuffer());
  const dynamic = /^top-/.test(url.searchParams.get('bg') || '');
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', dynamic ? 'public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400' : 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=2592000');
  res.status(200).send(buf);
}
