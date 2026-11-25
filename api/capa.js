// Capas 16:9 (PNG) para as pastas das Coleções do Nuvio.
//   /capa/<marca>.png          -> cartão do streaming (netflix, prime, disney, hbomax, apple, globoplay, paramount, crunchyroll, mubi, claro, pluto, youtube)
//   /capa/x.png?t=Título&s=Sub&p=paleta -> cartão de texto (lançamentos, gêneros, sagas)
import { ImageResponse } from '@vercel/og';

const SI = 'https://cdn.jsdelivr.net/npm/simple-icons@13.21.0/icons/';
const BRANDS = {
  netflix:     { bg: ['#000000', '#1a0000'], icon: 'netflix', ic: '#E50914', name: 'NETFLIX', nc: '#E50914', sp: 10 },
  prime:       { bg: ['#00050d', '#0f2a4a'], icon: 'primevideo', ic: '#1A98FF', iw: 300, name: '' },
  disney:      { bg: ['#040a2c', '#0b3d91'], name: 'Disney+', nc: '#ffffff', big: true },
  hbomax:      { bg: ['#05001a', '#3b0db3'], name: 'HBO Max', nc: '#ffffff', big: true },
  apple:       { bg: ['#000000', '#2b2b2b'], icon: 'appletv', ic: '#ffffff', name: 'Apple TV', nc: '#ffffff' },
  globoplay:   { bg: ['#ff2c1f', '#ff7a00'], name: 'globoplay', nc: '#ffffff', big: true },
  paramount:   { bg: ['#0064ff', '#00144d'], icon: 'paramountplus', ic: '#ffffff', name: 'Paramount+', nc: '#ffffff' },
  crunchyroll: { bg: ['#f47521', '#ff9b4a'], icon: 'crunchyroll', ic: '#ffffff', name: 'Crunchyroll', nc: '#ffffff' },
  mubi:        { bg: ['#001489', '#000a45'], icon: 'mubi', ic: '#ffffff', name: 'MUBI', nc: '#ffffff', sp: 8 },
  claro:       { bg: ['#da291c', '#8f0f06'], name: 'Claro tv+', nc: '#ffffff', big: true },
  pluto:       { bg: ['#000000', '#2a2a00'], name: 'Pluto TV', nc: '#fff200', big: true },
  youtube:     { bg: ['#0f0f0f', '#2a0000'], icon: 'youtube', ic: '#FF0000', name: 'YouTube', nc: '#ffffff' }
};
const PAL = {
  red: ['#7f1d1d', '#ef4444'], gold: ['#78350f', '#f59e0b'], blue: ['#0c1e4a', '#2563eb'], purple: ['#2e1065', '#9333ea'],
  green: ['#052e16', '#16a34a'], teal: ['#042f2e', '#0d9488'], pink: ['#500724', '#db2777'], gray: ['#0f172a', '#475569'],
  orange: ['#431407', '#ea580c'], cyan: ['#083344', '#0891b2'], black: ['#000000', '#262626'], lime: ['#1a2e05', '#65a30d']
};

const iconCache = new Map();
async function iconData(slug, color) {
  const k = slug + color;
  if (!iconCache.has(k)) iconCache.set(k, (async () => {
    const r = await fetch(SI + slug + '.svg');
    if (!r.ok) return null;
    const svg = (await r.text()).replace('<svg ', `<svg fill="${color}" `);
    return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  })().catch(() => null));
  return iconCache.get(k);
}

const el = (type, style, children) => ({ type, props: { style, children } });

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const slug = (url.pathname.split('/').pop() || '').replace(/\.png$/, '');
  const W = 640, H = 360;
  let tree;
  const b = BRANDS[slug];
  if (b) {
    const icon = b.icon ? await iconData(b.icon, b.ic) : null;
    tree = el('div', { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, ${b.bg[0]}, ${b.bg[1]})` }, [
      icon ? { type: 'img', props: { src: icon, width: b.iw || 120, height: b.iw || 120, style: { marginBottom: b.name ? 22 : 0 } } } : null,
      b.name && el('div', { fontSize: b.big ? 92 : 58, fontWeight: 700, color: b.nc, letterSpacing: b.sp || (b.big ? -2 : 0), display: 'flex' }, b.name)
    ].filter(Boolean));
  } else {
    const t = (url.searchParams.get('t') || 'Filmes').slice(0, 40);
    const s = (url.searchParams.get('s') || '').slice(0, 50);
    const [c1, c2] = PAL[url.searchParams.get('p')] || PAL.gray;
    const size = t.length <= 10 ? 84 : t.length <= 16 ? 66 : t.length <= 24 ? 52 : 42;
    tree = el('div', { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '40px 44px',
      background: `linear-gradient(135deg, ${c1}, ${c2})`, color: 'white' }, [
      s ? el('div', { fontSize: 26, fontWeight: 700, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 3, marginBottom: 8, display: 'flex' }, s) : null,
      el('div', { fontSize: size, fontWeight: 700, lineHeight: 1.05, display: 'flex' }, t),
      el('div', { width: 90, height: 8, background: 'rgba(255,255,255,0.9)', borderRadius: 4, marginTop: 18, display: 'flex' }, null)
    ].filter(Boolean));
  }
  const img = new ImageResponse(tree, { width: W, height: H });
  const buf = Buffer.from(await img.arrayBuffer());
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=2592000');
  res.status(200).send(buf);
}
