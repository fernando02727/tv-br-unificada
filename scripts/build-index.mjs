// Lê todos os addons de TV, junta canais iguais e grava data/index.json
// Uso: node scripts/build-index.mjs [saida.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { channelKey, displayName, classify, slugify, GROUPS, stripAccents } from '../lib/channels.mjs';
import { sortChannels, subgroupOf } from '../lib/subgroups.mjs';
import { chooseLogos } from '../lib/logos.mjs';
import { keepByRegion, regionOf, isForeign } from '../lib/regions.mjs';
import { prettyName, regionalName, fitName } from '../lib/names.mjs';
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
  if (src.type === 'static') {
    const items = (src.channels || []).map(c => ({ id: c.id, name: c.name, logo: c.logo || '', genres: c.genres || [], catName: src.name }));
    return { items, status: { ok: items.length > 0, count: items.length, catalogs: ['static'], error: '', name: src.name } };
  }
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
        if (src.idFilter && !new RegExp(src.idFilter, 'i').test(m.id)) continue;
        const ev = (m.name || '').match(/^\s*(\d{1,2})[:h](\d{2})\s*[-–|·]\s*(.+)$/);
        items.push({ id: m.id, name: m.name || '', logo: m.logo || m.poster || '', genres: m.genres || [], catName: c.name || c.id,
          event: ev ? { h: +ev[1], m: +ev[2], title: ev[3].trim() } : null });
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
    if (srcByKey[k]?.type === 'static') return true;
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

function smartTitle(t) {
  let s = t.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\b(fhd|uhd|hd|sd|4k|ao vivo|live)\b/gi, ' ').replace(/[|•]+/g, ' ').replace(/\s+/g, ' ').replace(/[\s\-–]+$/, '').trim();
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s.replace(/-(pr|sp|rj|mg|rs|sc|go|ba|pe|ce|es|df|mt|ms|pa|am)\b/gi, m => m.toUpperCase());
  return s.toLowerCase().replace(/(^|[\s\-/(])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bX\b/g, 'x').replace(/\b(Fc|Sc|Ec|Ac|Cr|Se|Psg)\b/g, m => m.toUpperCase()).replace(/-(pr|sp|rj|mg|rs|sc|go|ba|pe|ce|es|df|mt|ms|pa|am)\b/gi, m => m.toUpperCase());
}

// Pede ao servidor de São Paulo (Vercel) para medir a qualidade real das fontes.
// Guarda um histórico das últimas 6 medições para saber o que é estável.
async function measureQuality(channels, cfg) {
  if (!cfg.publicUrl || cfg.measure === false) return;
  const t0 = Date.now();
  let prev = {};
  try {
    const old = await getJSON(`https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY || 'fernando02727/tv-br-unificada'}/data/index.json?t=${Date.now()}`, 20000);
    for (const c of old.channels || []) if (c.q) prev[c.id] = c.q;
  } catch {}
  const batches = [];
  for (let i = 0; i < channels.length; i += 8) batches.push(channels.slice(i, i + 8));
  let done = 0, measured = 0;
  await pool(batches, 5, async (b) => {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
      const r = await fetch(`${cfg.publicUrl}/medir`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA },
        body: JSON.stringify({ channels: b.map(c => ({ id: c.id, srcs: c.srcs })) }), signal: ctl.signal });
      clearTimeout(t);
      const res = await r.json();
      for (const c of b) {
        const q = res[c.id]; if (!q) continue;
        for (const [k, v] of Object.entries(q)) {
          const ph = prev[c.id]?.[k]?.hist || '';
          v.hist = (ph + (v.ok ? '1' : v.blocked ? '' : '0')).slice(-6);
          if (!v.h && prev[c.id]?.[k]?.h) v.h = prev[c.id][k].h;
          measured++;
        }
        c.q = q;
      }
    } catch (e) { console.log('medição falhou num lote: ' + e.message); }
    done++;
  });
  const hs = channels.flatMap(c => Object.values(c.q || {})).filter(v => v.ok);
  const dist = {}; for (const v of hs) { const l = v.h >= 2000 ? '4K' : v.h >= 1000 ? '1080p' : v.h >= 700 ? '720p' : v.h ? 'SD' : '?'; dist[l] = (dist[l] || 0) + 1; }
  console.log(`Qualidade medida em SP: ${measured} fontes, ${hs.length} ok, resoluções ${JSON.stringify(dist)} [${Math.round((Date.now() - t0) / 1000)}s]`);
}

function fallbackLogos(channels, cfg) {
  // sem logo oficial: cartão gerado com o nome do canal na cor do grupo
  if (!cfg.publicUrl) return;
  for (const c of channels) if (!c.logo) {
    const q = new URLSearchParams({ n: c.event ? c.eventTitle : c.name, g: c.group });
    if (c.event) q.set('t', c.name.slice(0, 5));
    c.logo = `${cfg.publicUrl}/logo/${encodeURIComponent(c.key)}.png?${q}`;
  }
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
      let key = it.event ? 'evt' + String(it.event.h).padStart(2, '0') + String(it.event.m).padStart(2, '0') + channelKey(it.event.title).slice(0, 40) : channelKey(it.name);
      if (!key) continue;
      let ch = byKey.get(key);
      if (!ch) { ch = { key, names: [], logos: [], hints: [], srcs: [], event: it.event }; byKey.set(key, ch); }
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
    const c = { id, key: ch.key, name: ch.names[0][1], logos: [...new Set(ch.logos.map(l => l[1]))], group: classify(ch.key, ch.hints), srcs: ch.srcs.map(([k, sid]) => [k, sid]) };
    if (ch.event) {
      // horário do jogo em Brasília (UTC-3); se já passou há mais de 4 h, é de amanhã ou já acabou
      const nowBr = new Date(Date.now() - 3 * 3600e3);
      let start = Date.UTC(nowBr.getUTCFullYear(), nowBr.getUTCMonth(), nowBr.getUTCDate(), ch.event.h + 3, ch.event.m);
      if (start < Date.now() - 4 * 3600e3) start += 24 * 3600e3;
      if (start > Date.now() + 20 * 3600e3) continue;
      const title = smartTitle(ch.event.title);
      Object.assign(c, { event: true, eventStart: start, eventTitle: title, group: 'Esportes',
        name: fitName(`${String(ch.event.h).padStart(2, '0')}:${String(ch.event.m).padStart(2, '0')} · ${title}`, 38) });
      channels.push(c);
      continue;
    }
    const g = lookup(cfg.group, c);
    if (g && GROUPS.includes(g)) c.group = g;
    if (c.group === 'Outros' && ch.srcs.every(([k]) => dropOthers.has(k)) && !has(cfg.show, c)) continue;
    if (has(cfg.hide, c)) { hidden.manual++; continue; }
    if (!has(cfg.show, c) && !keepByRegion(c, cfg.regions)) { hidden.regiao++; continue; }
    if (!has(cfg.show, c) && cfg.hideForeign !== false && isForeign(c)) { hidden.estrangeiro++; continue; }
    const uf = regionOf(c); if (uf && c.group === 'Abertos') c.region = uf;
    c.name = lookup(cfg.rename, c) || (c.region && regionalName(c)) || prettyName(c.key, c.name);
    channels.push(c);
  }

  // mesmo nome final = mesmo canal (ex.: "Globo ES", "TV Gazeta Vitória ES" -> "Globo Vitória")
  {
    const byName = new Map();
    const merged = [];
    for (const c of channels) {
      const k = stripAccents(c.name).toLowerCase();
      const o = byName.get(k);
      if (o && !c.event) {
        for (const s of c.srcs) if (!o.srcs.some(x => x[0] === s[0] && x[1] === s[1])) o.srcs.push(s);
        o.logos.push(...c.logos);
        continue;
      }
      byName.set(k, c); merged.push(c);
    }
    channels = merged;
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
  // regionais: no máximo N por rede em cada estado (capital primeiro, depois mais fontes)
  {
    const max = cfg.regions?.maxPerNetwork ?? 3;
    const capital = /São Paulo|Vitória/;
    const buckets = new Map();
    for (const c of channels.filter(c => c.region)) {
      const net = c.name.split(' ')[0];
      const k = net + '|' + c.region;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(c);
    }
    const drop = new Set();
    for (const list of buckets.values()) {
      list.sort((a, b) => (capital.test(b.name) - capital.test(a.name)) || (b.srcs.length - a.srcs.length));
      list.slice(max).forEach(c => drop.add(c));
    }
    hidden.limiteRegional = drop.size;
    channels = channels.filter(c => !drop.has(c) || has(cfg.show, c));
  }
  for (const c of channels) c.sub = lookup(cfg.subgroup, c) || subgroupOf(c);
  await measureQuality(channels, cfg);
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
      const r = await buildEpg(channels, cfg.epg, console.log, async () => { await chooseLogos(channels, console.log, cfg); fallbackLogos(channels, cfg); });
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(path.join(path.dirname(OUT), 'epg.xml.gz'), r.gz);
      epgInfo = { channels: r.matched, programmes: r.programmes };
    } catch (e) { console.log('EPG falhou: ' + e.message); }
  }

  if (!cfg.epg?.sources?.length) await chooseLogos(channels, console.log, cfg);
  fallbackLogos(channels, cfg);
  for (const c of channels) { delete c.logos; delete c.epgIcon; }
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
