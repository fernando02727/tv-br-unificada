// Escolhe o melhor logo de cada canal: acervo tv-logos (curado, fundo transparente)
// > banco iptv-org > ícone da grade de programação > logos dos addons (validados).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { channelKey } from './channels.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UA = 'TVBR-Unificada/1.0 (+stremio addon aggregator)';
const TVLOGOS_RAW = 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/';
const FOLDERS = ['brazil', 'world-latin-america', 'international', 'portugal', 'united-states', 'argentina', 'mexico'];
const NETWORK_LOGO = { globo: 'globo', sbt: 'sbt', record: 'record', band: 'band', redetv: 'redetv', cultura: 'cultura' };

function tvlogosIndex() {
  const list = JSON.parse(fs.readFileSync(path.join(HERE, 'tvlogos-list.json'), 'utf8'));
  const idx = new Map();
  for (const folder of FOLDERS) {
    const files = (list[folder] || []).slice().sort((a, b) => (/-hz|-icon/.test(a) ? 1 : 0) - (/-hz|-icon/.test(b) ? 1 : 0));
    for (const f of files) {
      const base = f.replace(/\.png$/, '').replace(/-(br|lam|lat|us|int|pt|ar|mx|uk)$/, '').replace(/-(hz|hd|icon|white|light|dark|color)(?=-|$)/g, '');
      const k = channelKey(base.replace(/-/g, ' '));
      if (k && !idx.has(k)) idx.set(k, TVLOGOS_RAW + folder + '/' + f);
    }
  }
  return idx;
}

async function iptvOrgIndex(log) {
  const idx = new Map();
  try {
    const [chs, logos] = await Promise.all([
      fetch('https://iptv-org.github.io/api/channels.json', { headers: { 'user-agent': UA } }).then(r => r.json()),
      fetch('https://iptv-org.github.io/api/logos.json', { headers: { 'user-agent': UA } }).then(r => r.json())
    ]);
    const best = new Map();
    for (const l of logos) {
      if (!l.channel || !/png|jpe?g/i.test(l.format || l.url)) continue;
      const cur = best.get(l.channel);
      const score = (l.width || 0) * ((l.tags || []).includes('picons') ? 0.5 : 1);
      if (!cur || score > cur.score) best.set(l.channel, { url: l.url, score });
    }
    for (const c of chs) {
      if (c.country !== 'BR' && c.country !== 'PT') continue;
      const b = best.get(c.id); if (!b) continue;
      for (const n of [c.name, ...(c.alt_names || [])]) {
        const k = channelKey(n);
        if (k && !idx.has(k)) idx.set(k, b.url);
      }
    }
    log(`Logos iptv-org: ${idx.size}`);
  } catch (e) { log('Logos iptv-org falhou: ' + e.message); }
  return idx;
}

// Logos do catálogo público da Saimo TV (canal: / logo:) — mapa nome -> logo
async function saimoIndex(log) {
  const idx = new Map();
  try {
    const txt = await (await fetch('https://canais-saimo.pages.dev/catalogo.txt', { headers: { 'user-agent': UA } })).text();
    let name = null;
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^(canal|logo):\s*(.+)$/);
      if (!m) continue;
      if (m[1] === 'canal') name = m[2].trim();
      else if (name) { const k = channelKey(name); if (k && !idx.has(k)) idx.set(k, m[2].trim()); }
    }
    log(`Logos Saimo: ${idx.size}`);
  } catch (e) { log('Logos Saimo falhou: ' + e.message); }
  return idx;
}

// 'png' | 'jpg' | 'webp' | 'svg' | 'gif' | null
async function imageKind(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, range: 'bytes=0-2047' }, signal: ctl.signal, redirect: 'follow' });
    if (!r.ok && r.status !== 206) return null;
    const ct = r.headers.get('content-type') || '';
    const b = Buffer.from(await r.arrayBuffer());
    if (b[0] === 0x89 && b[1] === 0x50) return 'png';
    if (b[0] === 0xff && b[1] === 0xd8) return 'jpg';
    if (b.slice(8, 12).toString() === 'WEBP') return 'webp';
    if (b.slice(0, 3).toString() === 'GIF') return 'gif';
    const head = b.toString('utf8', 0, 400);
    if (/<svg/i.test(head) || /svg/.test(ct)) return 'svg';
    return null;
  } catch { return null; } finally { clearTimeout(t); }
}
async function imageOk(url) { return !!(await imageKind(url)); }

// a TV só decodifica PNG/JPEG: o resto passa pelo nosso conversor
function tvSafe(url, kind, publicUrl) {
  if (!publicUrl || kind === 'png' || kind === 'jpg') return url;
  return `${publicUrl}/img?u=${encodeURIComponent(url)}`;
}

export async function chooseLogos(channels, log = console.log, cfg = {}) {
  const publicUrl = cfg.publicUrl || '';
  const manual = cfg.logos || {};
  const tv = tvlogosIndex();
  const [io, sm] = await Promise.all([iptvOrgIndex(log), saimoIndex(log)]);
  // logo genérico = o mesmo arquivo em canais de "famílias" diferentes (avatar padrão do addon)
  const users = new Map();
  for (const c of channels) for (const l of c.logos || []) { if (!users.has(l)) users.set(l, new Set()); users.get(l).add(c.key.replace(/\d+$/, '').slice(0, 5)); }
  const generic = l => (users.get(l)?.size || 0) >= 3 || /placeholder|default|noimage|no-logo|avatar|blank/i.test(l);

  const pending = [];
  let curated = 0;
  for (const c of channels) {
    if (c.event) { c.logo = ''; continue; }
    const net = c.region ? (c.key.match(/^(globo|sbt|record|band|redetv|cultura)/) || [])[1] : null;
    const famBase = c.key.replace(/\d+$/, '');
    const famKey = channelKey(famBase);
    const man = manual[c.key] || manual[famBase] || manual[famKey];
    const cur = man || tv.get(c.key) || (net && tv.get(NETWORK_LOGO[net])) || io.get(c.key) || tv.get(famBase) || tv.get(famKey) || io.get(famBase) || io.get(famKey);
    if (cur && !/^https:\/\/commons\.wikimedia/.test(cur)) { c.logo = cur; curated++; continue; }
    const cands = [cur, sm.get(c.key), sm.get(famKey), c.epgIcon,
      `https://docdog.top/logo/countries/brazil/${c.key}.png`,
      `https://img.faz-o-eli.online/${c.key}.png`,
      ...(c.logos || [])].filter(l => l && !generic(l));
    c.logo = '';
    pending.push([c, [...new Set(cands)]]);
  }
  let i = 0, ok = 0;
  await Promise.all(Array.from({ length: 24 }, async () => {
    while (i < pending.length) {
      const [c, cands] = pending[i++];
      for (const l of cands) { const k = await imageKind(l); if (k) { c.logo = tvSafe(l, k, publicUrl); ok++; break; } }
    }
  }));
  // canais 24h de artista/série sem logo de canal: foto do artista (Deezer) ou pôster da série (TVmaze)
  const norm = x => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const clean = n => n.replace(/\b(T\d+|S\d+|\d+|24 ?horas|classico|cl[aá]ssico|novo|ao vivo|tv)\b/gi, ' ').replace(/[-–:+].*$/, '').replace(/\s+/g, ' ').trim();
  const art = channels.filter(c => !c.logo && !c.event && /Música · Artistas|24 Horas|Desenhos 24h|Pluto/.test(c.sub || ''));
  const memo = new Map();
  let j = 0, arts = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (j < art.length) {
      const c = art[j++];
      const q = clean(c.name);
      if (q.length < 3) continue;
      const music = /Música/.test(c.sub);
      const mk = (music ? 'm|' : 's|') + norm(q);
      if (!memo.has(mk)) memo.set(mk, (async () => {
        try {
          if (music) {
            const d = await (await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(q)}&limit=3`, { headers: { 'user-agent': UA } })).json();
            const hit = (d.data || []).find(a => norm(a.name) === norm(q) || norm(a.name).startsWith(norm(q)));
            return hit?.picture_xl || '';
          }
          const d = await (await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`, { headers: { 'user-agent': UA } })).json();
          const hit = (d || []).map(x => x.show).find(sh => norm(sh.name) === norm(q));
          return hit?.image?.original || hit?.image?.medium || '';
        } catch { return ''; }
      })());
      const u = await memo.get(mk);
      if (u) { c.logo = u; arts++; }
    }
  }));
  if (arts) log(`Logos de artista/série: ${arts}`);
  // família sem logo herda o logo do irmão (Premiere 2 <- Premiere, Prime Video 3 <- Prime Video 2)
  const famLogo = new Map();
  for (const c of channels) if (c.logo && !c.event) { const f = c.key.replace(/\d+$/, ''); if (!famLogo.has(f)) famLogo.set(f, c.logo); }
  for (const c of channels) if (!c.logo && !c.event) c.logo = famLogo.get(c.key.replace(/\d+$/, '')) || '';
  const none = channels.filter(c => !c.logo && !c.event).length;
  log(`Logos: ${curated} do acervo, ${ok} validados de outras fontes, ${none} sem logo oficial (vão de cartão)`);
}
