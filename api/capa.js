// Arte das pastas das Coleções do Nuvio (capa, capa animada e fundo do destaque).
//
//   /capa/<marca>.png            capa 640x360: cena + logo oficial do streaming
//   /capa/<marca>.gif            capa animada 480x270 (toca quando o card ganha foco na TV)
//   /capa/<marca>.jpg            fundo limpo 1280x720 (destaque da Home quando a pasta está em foco)
//   /capa/c.png|gif|jpg?t=Título&s=Etiqueta&p=paleta&ids=tt1,tt2&l=lista
//
// De onde vêm as imagens (tudo gratuito e sem chave):
//   ids=  -> images.metahub.space (acervo do Stremio, por código IMDb)
//   l=    -> lista viva: catálogos do addon TMDB pt-BR (em alta, lançamentos, por streaming, por gênero)
// As imagens fixas (ids) vêm primeiro; a lista viva completa até 4 quadros.
import { ImageResponse } from '@vercel/og';
import sharp from 'sharp';
import gifenc from 'gifenc';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { GIFEncoder, quantize, applyPalette } = gifenc;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRAND_DIR = path.join(HERE, '..', 'lib');
const W = 640, H = 360, GW = 480, GH = 270, QUADROS = 4;

const TMDB = 'https://tmdb.elfhosted.com/N4IgNghgdg5grhGBTEAuEAHALgWgEIBKIANCAMYRYRgD2MAzmgNqgCWAJmiFgLbsBGAOiwAnJFHatYJbgE8MKdDxoA3VilJQIPRSBn0AFjQDuASSgAJGjrSi4SAL7E2ndLwHCxEqTBlZ5uvRIIuqMmtq6+kZmltaKdo7OIBxc7kJYNBh+AVzKahogWjboUSbmVsUJTi6pfOmZ2QpcQSFIYYURXKUxFfEi9tXJrtx1gpBYbViNunnqMkWRpIZlsZX9iTVuo+OT083BofOdJUvR5XG264MpWx6ySBAie0qqc+HFeqcrvZcDSTcjO4PJ6kfxNdAtQ7vRYgZY9C6oKr-Yb0UQPHg+QRQABmAA9niBZgUFl0vvC1n9NrC0dpMTj8aCchCDm0jh9uucKRshs0aRjYIJ2FAsozwYTXsTjp9YWdVn1KTyIXzMUKRXIxZDWdDSTLvgikVTUWJaQLtGqwTMJWyYXDOfLuQCjejMWaCZr2iSTrryfbrijlQKDPweASidadba5b8Hf7jfyYIIgyHRYEWR6pRyo4irsjeXGXVhzUzxflw17Iz9swrHQGE5Qixq02XpRX9TnDbXBBgeA3LaXteXZZWDYrqfmBd3e-tWun2WS7dG-XnnQKYA0U7krQOW0O29XYyuE2up8yZ83M8P26OnSaE2R+qGtx0596F1WY8vb4J73A3U3txee4fkq453mAKiPv2z42ruXJLiBh7fuBf5ngB85ZlUAC6SzAmQBgAKJaPwYBIMMCQyGIWBwCIUCmHUphkesIAOEAA';
const NFX10 = 'https://catalog.ers.pw/OjpCUjoxNzkzODAwMDAwMDAwOjA6MTpCUg%3D%3D';
// listas vivas permitidas (chave -> caminhos de catálogo; vários = intercalados)
const LISTAS = {
  trend: [`${TMDB}/catalog/movie/tmdb.trending/genre=Week.json`],
  'trend-s': [`${TMDB}/catalog/series/tmdb.trending/genre=Week.json`],
  latest: [`${TMDB}/catalog/movie/tmdb.latest.json`],
  y2026: [`${TMDB}/catalog/movie/tmdb.year/genre=2026.json`],
  top: [`${TMDB}/catalog/movie/tmdb.top.json`],
  nfx10: [`${NFX10}/catalog/movie/netflix-top10-BR.json`, `${NFX10}/catalog/series/netflix-top10-BR.json`]
};
for (const c of ['nfx', 'amp', 'dnp', 'hbm', 'atp', 'gop', 'pmp', 'cru', 'clv'])
  LISTAS['st-' + c] = [`${TMDB}/catalog/series/streaming.${c}.json`, `${TMDB}/catalog/movie/streaming.${c}.json`];
const GENEROS = ['Animação', 'Aventura', 'Ação', 'Comédia', 'Crime', 'Documentário', 'Drama', 'Família', 'Fantasia', 'Faroeste', 'Ficção científica', 'Guerra', 'História', 'Mistério', 'Música', 'Romance', 'Terror', 'Thriller'];
GENEROS.forEach((g, i) => { LISTAS['g' + i] = [`${TMDB}/catalog/movie/tmdb.top/genre=${encodeURIComponent(g)}.json`]; });

const BRANDS = {
  netflix:     { logo: 'netflix-int.png', lw: 340, ids: 'tt4574334', l: 'st-nfx', tint: '#000000' },
  prime:       { logo: 'primevideo.png', lw: 300, ids: 'tt1190634', l: 'st-amp', tint: '#00050d' },
  disney:      { logo: 'disney-plus-int.png', lw: 330, ids: 'tt8111088', l: 'st-dnp', tint: '#040a2c' },
  hbomax:      { logo: 'hbo-max-color-us.png', lw: 280, ids: 'tt11198330', l: 'st-hbm', tint: '#05001a' },
  apple:       { logo: 'appletv.png', lw: 200, ids: 'tt11280740', l: 'st-atp', tint: '#000000', plus: true },
  globoplay:   { logo: 'globoplay.png', lw: 380, ids: 'tt2303077', l: 'st-gop', tint: '#000000' },
  paramount:   { logo: 'paramount-plus-white-us.png', lw: 300, ids: 'tt4236770', l: 'st-pmp', tint: '#00144d' },
  crunchyroll: { logo: 'crunchyroll.png', lw: 150, ids: 'tt21209876', l: 'st-cru', tint: '#1a0a00', name: 'Crunchyroll' },
  mubi:        { logo: 'mubi.png', lw: 150, ids: 'tt17526714,tt19770238,tt14039582,tt12477480', tint: '#000a45', name: 'MUBI' },
  claro:       { ids: '', l: 'st-clv', tint: '#5c0a04', name: 'Claro tv+' }
};
const PAL = {
  red: ['#7f1d1d', '#ef4444'], gold: ['#78350f', '#f59e0b'], blue: ['#0c1e4a', '#2563eb'], purple: ['#2e1065', '#9333ea'],
  green: ['#052e16', '#16a34a'], teal: ['#042f2e', '#0d9488'], pink: ['#500724', '#db2777'], gray: ['#0f172a', '#475569'],
  orange: ['#431407', '#ea580c'], cyan: ['#083344', '#0891b2'], black: ['#000000', '#262626'], lime: ['#1a2e05', '#65a30d']
};

async function get(url, ms = 7000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, redirect: 'follow' }); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); }
  catch { return null; } finally { clearTimeout(t); }
}

// URLs de imagem de fundo, na ordem: ids fixos, depois a lista viva. `larg` = 780 (capa/gif) ou 1280 (fundo).
const listaCache = new Map();
async function listaViva(chave) {
  const caminhos = LISTAS[chave];
  if (!caminhos) return [];
  const c = listaCache.get(chave);
  if (c && Date.now() - c.t < 3600e3) return c.v;
  const partes = await Promise.all(caminhos.map(async u => {
    try { return (JSON.parse(await get(u, 8000)).metas || []).filter(m => m && m.background).slice(0, 8).map(m => m.background); } catch { return []; }
  }));
  const v = [];
  for (let i = 0; i < 8; i++) for (const p of partes) if (p[i] && !v.includes(p[i])) v.push(p[i]);
  if (v.length) listaCache.set(chave, { t: Date.now(), v });
  return v;
}
async function fundos(ids, lista, larg, max) {
  const out = [];
  for (const id of String(ids || '').split(',')) {
    if (/^tt\d+$/.test(id)) out.push(`https://images.metahub.space/background/${larg > 780 ? 'medium' : 'small'}/${id}/img`);
    else if (/^top-(movie|series)$/.test(id)) lista = lista || (id === 'top-movie' ? 'trend' : 'trend-s'); // formato antigo
  }
  if (out.length < max && lista) {
    for (const u of await listaViva(lista)) {
      if (out.length >= max) break;
      out.push(u.replace(/\/t\/p\/\w+\//, `/t/p/${larg > 780 ? 'w1280' : 'w780'}/`));
    }
  }
  return out.slice(0, max);
}
async function baixar(url, w, h) {
  const b = await get(url);
  if (!b) return null;
  try { return await sharp(b).resize(w, h, { fit: 'cover', position: 'attention' }).removeAlpha().toBuffer(); } catch { return null; }
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

// Camada de cima (transparente): véu na cor da marca + logo, ou véu + etiqueta e título.
async function sobreposicao(b, q, temFundo) {
  const layers = [];
  if (b) {
    if (temFundo) layers.push(layer({ background: `linear-gradient(180deg, ${b.tint}55 0%, ${b.tint}cc 60%, ${b.tint}f2 100%)` }, null));
    else layers.push(layer({ background: `linear-gradient(135deg, ${b.tint}, #000000)` }, null));
    const kids = [];
    if (b.logo) { const l = await logoData(b.logo, b.lw).catch(() => null); if (l) kids.push({ type: 'img', props: { src: l.src, width: l.w, height: l.h } }); }
    if (b.plus) kids.push(el('div', { fontSize: 96, color: '#fff', marginLeft: 6, display: 'flex' }, '+'));
    if (b.name) kids.push(el('div', { fontSize: b.logo ? 54 : 88, color: '#fff', marginLeft: b.logo ? 18 : 0, display: 'flex' }, b.name));
    layers.push(layer({ alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }, kids));
  } else {
    const t = (q.get('t') || 'Filmes').slice(0, 40);
    const s = (q.get('s') || '').slice(0, 50);
    const [c1, c2] = PAL[q.get('p')] || PAL.gray;
    const size = t.length <= 10 ? 80 : t.length <= 16 ? 64 : t.length <= 24 ? 50 : 40;
    if (temFundo) {
      layers.push(layer({ background: `linear-gradient(90deg, ${c1}f0 0%, ${c1}b0 45%, ${c1}10 100%)` }, null));
      layers.push(layer({ background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.75) 100%)' }, null));
    } else layers.push(layer({ background: `linear-gradient(135deg, ${c1}, ${c2})` }, null));
    layers.push(layer({ flexDirection: 'column', justifyContent: 'flex-end', padding: '36px 40px', color: '#fff' }, [
      s ? el('div', { fontSize: 24, opacity: 0.9, textTransform: 'uppercase', letterSpacing: 3, marginBottom: 6, display: 'flex' }, s) : null,
      el('div', { fontSize: size, fontWeight: 700, lineHeight: 1.05, display: 'flex', maxWidth: 520, textShadow: '0 2px 12px rgba(0,0,0,0.6)' }, t),
      el('div', { width: 84, height: 7, background: '#fff', borderRadius: 4, marginTop: 16, display: 'flex' }, null)
    ].filter(Boolean)));
  }
  const img = new ImageResponse(el('div', { width: W, height: H, display: 'flex', position: 'relative' }, layers), { width: W, height: H });
  return Buffer.from(await img.arrayBuffer());
}

function enviar(res, tipo, buf, vivo) {
  res.setHeader('Content-Type', tipo);
  res.setHeader('Cache-Control', vivo ? 'public, max-age=3600, s-maxage=43200, stale-while-revalidate=604800' : 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=2592000');
  res.status(200).send(buf);
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const q = url.searchParams;
  const m = (url.pathname.split('/').pop() || '').match(/^(.*?)\.(png|gif|jpg)$/) || [null, url.pathname.split('/').pop() || '', 'png'];
  const b = BRANDS[m[1]] || null, ext = m[2];
  const ids = q.get('ids') || q.get('bg') || (b ? b.ids : '');
  const lista = q.get('l') || (b ? b.l : '') || '';
  const vivo = !!lista || /top-/.test(ids);
  const preto = { create: { width: W, height: H, channels: 3, background: '#000000' } };

  if (ext === 'jpg') { // fundo limpo do destaque
    const [u] = await fundos(ids, lista, 1280, 1);
    const f = u && await baixar(u, 1280, 720);
    if (!f) { res.status(404).send('sem imagem'); return; }
    return enviar(res, 'image/jpeg', await sharp(f).jpeg({ quality: 84 }).toBuffer(), vivo);
  }

  const urls = await fundos(ids, lista, 780, ext === 'gif' ? QUADROS : 1);
  if (ext === 'png') {
    const f = urls[0] ? await baixar(urls[0], W, H) : null;
    const topo = await sobreposicao(b, q, !!f);
    const base = f ? sharp(f) : sharp(preto);
    return enviar(res, 'image/png', await base.composite([{ input: topo }]).png().toBuffer(), vivo);
  }

  // GIF: cada imagem fica parada ~2,4 s e passa para a próxima com um esmaecer curto
  const bons = (await Promise.all(urls.map(u => baixar(u, GW, GH)))).filter(Boolean);
  const topo = await sharp(await sobreposicao(b, q, bons.length > 0)).resize(GW, GH).toBuffer();
  const base = bons.length ? bons : [await sharp({ create: { width: GW, height: GH, channels: 3, background: '#000000' } }).png().toBuffer()];
  const telas = await Promise.all(base.map(f => sharp(f).composite([{ input: topo }]).ensureAlpha().raw().toBuffer()));
  const gif = GIFEncoder();
  const quadro = (rgba, ms) => { const pal = quantize(rgba, 256); gif.writeFrame(applyPalette(rgba, pal), GW, GH, { palette: pal, delay: ms }); };
  const n = telas.length;
  for (let i = 0; i < n; i++) {
    quadro(telas[i], n > 1 ? 2400 : 4000);
    if (n < 2) break;
    const a = telas[i], z = telas[(i + 1) % n];
    for (const k of [0.25, 0.5, 0.75]) {
      const mix = Buffer.allocUnsafe(a.length);
      for (let p = 0; p < a.length; p++) mix[p] = a[p] + (z[p] - a[p]) * k;
      quadro(mix, 90);
    }
  }
  gif.finish();
  return enviar(res, 'image/gif', Buffer.from(gif.bytes()), vivo);
}
