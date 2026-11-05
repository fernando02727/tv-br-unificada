// Lê todos os addons de TV, junta canais iguais e grava data/index.json
// Uso: node scripts/build-index.mjs [saida.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { channelKey, displayName, classify, sortChannels, slugify, GROUPS } from '../lib/channels.mjs';
import { keepByRegion, regionOf, isForeign } from '../lib/regions.mjs';
import { prettyName } from '../lib/names.mjs';
import { buildEpg } from '../lib/epg.mjs';

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
        if (/^\s*\d{1,2}[:h]\d{2}\s*[-–]/.test(m.name || '')) continue; // eventos com horário
        items.push({ id: m.id, name: m.name || '', logo: m.logo || m.poster || '', genres: m.genres || [], catName: c.name || c.id });
      }
      skip += metas.length;
      if (!canSkip || src.paginate === false || seen.size >= (src.maxPerCatalog || MAX_ITEMS_PER_CATALOG)) break;
    }
  }
  return { items, status: { ok: items.length > 0, count: items.length, catalogs: cats.map(c => c.id), error: errors.join('; ') || (items.length ? '' : 'nenhum canal'), name: man.name } };
}

const health = {};
async function probeChannel(ch, srcByKey, deadline) {
  for (const [k, id] of ch.srcs) {
    if (Date.now() > deadline) return true; // sem tempo: na dúvida, mantém
    const h = health[k] ||= { ok: 0, fail: 0 };
    if (h.ok === 0 && h.fail >= 6) continue; // fonte fora do ar: pula
    const base = resolveManifest(srcByKey[k]).replace(/\/manifest\.json(\?.*)?$/, '');
    if (!base) continue;
    try {
      const j = await getJSON(`${base}/stream/tv/${encodeURIComponent(id)}.json`, 7000);
      if ((j.streams || []).some(s => s.url || s.ytId || s.infoHash)) { h.ok++; return true; }
    } catch { h.fail++; }
  }
  return false;
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

async function main() {
  const cfg = fs.existsSync(path.join(ROOT, 'config.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')) : {};
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

  const dropOthers = new Set(sources.filter(s => s.dropUnclassified).map(s => s.key));
  const has = (list, ch) => (list || []).some(x => x === ch.key || x === ch.id);
  const lookup = (obj, ch) => obj?.[ch.id] ?? obj?.[ch.key];
  const hidden = { regiao: 0, estrangeiro: 0, manual: 0, semFonte: 0 };
  let channels = [];
  for (const ch of byKey.values()) {
    ch.names.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length);
    ch.logos.sort((a, b) => a[0] - b[0]);
    ch.srcs.sort((a, b) => a[2] - b[2]);
    const id = 'brtv:' + slugify(ch.key);
    const c = { id, key: ch.key, name: ch.names[0][1], logo: ch.logos[0]?.[1] || '', group: classify(ch.key, ch.hints), srcs: ch.srcs.map(([k, sid]) => [k, sid]) };
    const g = lookup(cfg.group, c);
    if (g && GROUPS.includes(g)) c.group = g;
    if (c.group === 'Outros' && ch.srcs.every(([k]) => dropOthers.has(k)) && !has(cfg.show, c)) continue;
    if (has(cfg.hide, c)) { hidden.manual++; continue; }
    if (!has(cfg.show, c) && !keepByRegion(c, cfg.regions)) { hidden.regiao++; continue; }
    if (!has(cfg.show, c) && cfg.hideForeign !== false && isForeign(c)) { hidden.estrangeiro++; continue; }
    c.name = lookup(cfg.rename, c) || prettyName(c.key, c.name);
    const uf = regionOf(c); if (uf && c.group === 'Abertos') c.region = uf;
    channels.push(c);
  }

  if (cfg.probeStreams !== false) {
    const srcByKey = Object.fromEntries(sources.map(s => [s.key, s]));
    const t0 = Date.now();
    const alive = new Array(channels.length).fill(true);
    const deadline = Date.now() + (cfg.probeSeconds || 240) * 1000;
    await pool(channels, 24, async (ch, i) => { alive[i] = await probeChannel(ch, srcByKey, deadline); });
    console.log('Saúde das fontes:', JSON.stringify(health));
    const before = channels.length;
    channels = channels.filter((c, i) => alive[i] || has(cfg.show, c));
    hidden.semFonte = before - channels.length;
    console.log(`Teste de fontes: ${channels.length}/${before} com link funcionando [${Math.round((Date.now() - t0) / 1000)}s]`);
  }
  sortChannels(channels);

  // nomes duplicados depois de padronizar? diferencia pelo sufixo do grupo
  const seenNames = new Map();
  for (const c of channels) {
    const k = c.name.toLowerCase();
    seenNames.set(k, (seenNames.get(k) || 0) + 1);
    if (seenNames.get(k) > 1) c.name = `${c.name} (${seenNames.get(k)})`;
  }

  let epgInfo = null;
  if (cfg.epg?.sources?.length) {
    try {
      const r = await buildEpg(channels, cfg.epg);
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(path.join(path.dirname(OUT), 'epg.xml.gz'), r.gz);
      epgInfo = { channels: r.matched, programmes: r.programmes };
    } catch (e) { console.log('EPG falhou: ' + e.message); }
  }

  const status = {};
  for (const [src, r] of results) status[src.key] = { name: src.name, ...r.status };
  const index = {
    updatedAt: new Date().toISOString(),
    totalItems: results.reduce((n, [, r]) => n + r.items.length, 0),
    totalChannels: channels.length,
    hidden,
    epg: epgInfo,
    sources: status,
    channels
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(index));
  console.log(`OK: ${index.totalItems} itens de ${results.length} addons -> ${channels.length} canais únicos`);
  for (const [k, s] of Object.entries(status)) console.log(` - ${s.name}: ${s.ok ? s.count + ' canais' : 'FALHOU'} ${s.error ? '(' + s.error.slice(0, 150) + ')' : ''} [${s.ms}ms]`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
