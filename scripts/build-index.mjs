// Lê todos os addons de TV, junta canais iguais e grava data/index.json
// Uso: node scripts/build-index.mjs [saida.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { channelKey, displayName, classify, sortChannels, slugify } from '../lib/channels.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = process.argv[2] || path.join(ROOT, 'data', 'index.json');
const UA = 'TVBR-Unificada/1.0 (+stremio addon aggregator)';
const SKIP_CATALOG = /event|agenda|proxim|upcoming|replay|highlight|vod|filme(s)?$|series$|movies?$/i;
const MAX_ITEMS_PER_CATALOG = 3000;

export function resolveManifest(src, env = process.env) {
  const m = src.manifest || '';
  if (m.startsWith('$ENV:')) return env[m.slice(5)] || '';
  return m;
}

async function getJSON(url, timeout = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = await r.text();
    try { return JSON.parse(txt); } catch { throw new Error('resposta não é JSON'); }
  } finally { clearTimeout(t); }
}

async function readSource(src) {
  const manifestUrl = resolveManifest(src);
  if (!manifestUrl) return { items: [], status: { ok: false, error: 'link não configurado' } };
  const base = manifestUrl.replace(/\/manifest\.json(\?.*)?$/, '');
  const man = await getJSON(manifestUrl);
  const cats = (man.catalogs || []).filter(c => {
    if (c.type !== 'tv') return false;
    if (src.includeCatalogs) return src.includeCatalogs.includes(c.id);
    if (src.excludeCatalogs?.includes(c.id)) return false;
    if (SKIP_CATALOG.test(c.id) || SKIP_CATALOG.test(c.name || '')) return false;
    const required = (c.extra || []).some(e => e.isRequired && e.name !== 'skip');
    return !required;
  });
  const items = [];
  const errors = [];
  for (const c of cats) {
    const canSkip = (c.extra || []).some(e => e.name === 'skip') || (c.extraSupported || []).includes('skip');
    let skip = 0, seen = new Set();
    for (let page = 0; page < 60; page++) {
      const url = skip ? `${base}/catalog/tv/${encodeURIComponent(c.id)}/skip=${skip}.json` : `${base}/catalog/tv/${encodeURIComponent(c.id)}.json`;
      let metas;
      try { metas = (await getJSON(url)).metas || []; }
      catch (e) { errors.push(`${c.id}: ${e.message}`); break; }
      const fresh = metas.filter(m => m && m.id && !seen.has(m.id));
      if (!fresh.length) break;
      for (const m of fresh) {
        seen.add(m.id);
        items.push({ id: m.id, name: m.name || '', logo: m.logo || m.poster || '', genres: m.genres || [], catName: c.name || c.id });
      }
      skip += metas.length;
      if (!canSkip || seen.size >= MAX_ITEMS_PER_CATALOG) break;
    }
  }
  return { items, status: { ok: items.length > 0, count: items.length, catalogs: cats.map(c => c.id), error: errors.join('; ') || (items.length ? '' : 'nenhum canal'), name: man.name } };
}

async function main() {
  const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'sources.json'), 'utf8')).filter(s => s.enabled !== false);
  const results = await Promise.all(sources.map(async s => {
    const t0 = Date.now();
    try { const r = await readSource(s); r.status.ms = Date.now() - t0; return [s, r]; }
    catch (e) { return [s, { items: [], status: { ok: false, count: 0, error: e.message, ms: Date.now() - t0 } }]; }
  }));

  const byKey = new Map();
  for (const [src, { items }] of results) {
    for (const it of items) {
      const key = channelKey(it.name);
      if (!key) continue;
      let ch = byKey.get(key);
      if (!ch) { ch = { key, names: [], logos: [], hints: [], srcs: [] }; byKey.set(key, ch); }
      ch.names.push([src.priority, displayName(it.name)]);
      if (it.logo) ch.logos.push([src.priority, it.logo]);
      ch.hints.push(...it.genres, it.catName);
      if (src.defaultGroup) ch.hints.unshift(src.defaultGroup);
      if (!ch.srcs.some(x => x[0] === src.key && x[1] === it.id)) ch.srcs.push([src.key, it.id, src.priority]);
    }
  }

  const channels = [];
  for (const ch of byKey.values()) {
    ch.names.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length);
    ch.logos.sort((a, b) => a[0] - b[0]);
    ch.srcs.sort((a, b) => a[2] - b[2]);
    const group = classify(ch.key, ch.hints);
    channels.push({
      id: 'brtv:' + slugify(ch.key),
      key: ch.key,
      name: ch.names[0][1],
      logo: ch.logos[0]?.[1] || '',
      group,
      srcs: ch.srcs.map(([k, id]) => [k, id])
    });
  }
  sortChannels(channels);

  const status = {};
  for (const [src, r] of results) status[src.key] = { name: src.name, ...r.status };
  const index = {
    updatedAt: new Date().toISOString(),
    totalItems: results.reduce((n, [, r]) => n + r.items.length, 0),
    totalChannels: channels.length,
    sources: status,
    channels
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(index));
  console.log(`OK: ${index.totalItems} itens de ${results.length} addons -> ${channels.length} canais únicos`);
  for (const [k, s] of Object.entries(status)) console.log(` - ${s.name}: ${s.ok ? s.count + ' canais' : 'FALHOU'} ${s.error ? '(' + s.error.slice(0, 150) + ')' : ''} [${s.ms}ms]`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
