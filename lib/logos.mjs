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

async function imageOk(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, range: 'bytes=0-1023' }, signal: ctl.signal });
    if (!r.ok && r.status !== 206) return false;
    const ct = r.headers.get('content-type') || '';
    const b = Buffer.from(await r.arrayBuffer());
    const png = b[0] === 0x89 && b[1] === 0x50, jpg = b[0] === 0xff && b[1] === 0xd8, webp = b.slice(8, 12).toString() === 'WEBP', gif = b.slice(0, 3).toString() === 'GIF';
    return png || jpg || webp || gif || /^image\/(png|jpe?g|webp|gif)/.test(ct);
  } catch { return false; } finally { clearTimeout(t); }
}

export async function chooseLogos(channels, log = console.log) {
  const tv = tvlogosIndex();
  const io = await iptvOrgIndex(log);
  // logo usado por muitos canais diferentes = avatar genérico do addon
  const freq = new Map();
  for (const c of channels) for (const l of c.logos || []) freq.set(l, (freq.get(l) || 0) + 1);
  const generic = l => (freq.get(l) || 0) >= 4 || /placeholder|default|noimage|no-logo|avatar|blank/i.test(l);

  const pending = [];
  let curated = 0;
  for (const c of channels) {
    const net = c.region ? (c.key.match(/^(globo|sbt|record|band|redetv|cultura)/) || [])[1] : null;
    const famBase = c.key.replace(/\d+$/, '');
    const famKey = channelKey(famBase);
    const cur = tv.get(c.key) || (net && tv.get(NETWORK_LOGO[net])) || io.get(c.key) || tv.get(famBase) || tv.get(famKey) || io.get(famBase) || io.get(famKey);
    if (cur && !c.event) { c.logo = cur; curated++; continue; }
    const cands = [c.epgIcon, ...(c.logos || [])].filter(l => l && !generic(l));
    c.logo = '';
    pending.push([c, [...new Set(cands)]]);
  }
  let i = 0, ok = 0;
  await Promise.all(Array.from({ length: 24 }, async () => {
    while (i < pending.length) {
      const [c, cands] = pending[i++];
      for (const l of cands) if (await imageOk(l)) { c.logo = l; ok++; break; }
      // nenhum validou daqui (servidor pode bloquear o GitHub): usa o 1º mesmo assim
      if (!c.logo && cands.length) c.logo = cands[0];
    }
  }));
  // família sem logo herda o logo do irmão (Premiere 2 <- Premiere, Prime Video 3 <- Prime Video 2)
  const famLogo = new Map();
  for (const c of channels) if (c.logo && !c.event) { const f = c.key.replace(/\d+$/, ''); if (!famLogo.has(f)) famLogo.set(f, c.logo); }
  for (const c of channels) if (!c.logo && !c.event) c.logo = famLogo.get(c.key.replace(/\d+$/, '')) || '';
  // jogos usam o logo do esporte genérico do canal de origem, se houver
  const none = channels.filter(c => !c.logo).length;
  log(`Logos: ${curated} do acervo, ${ok} dos addons validados, ${none} sem logo`);
}
