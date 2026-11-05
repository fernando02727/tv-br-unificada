// Addon Stremio/Nuvio "TV BR Unificada" — roda como função na Vercel.
import fs from 'node:fs';
import path from 'node:path';
import { GROUPS, slugify, stripAccents } from '../lib/channels.mjs';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const SOURCES = JSON.parse(fs.readFileSync(path.join(ROOT, 'sources.json'), 'utf8'));
const SRC = Object.fromEntries(SOURCES.map(s => [s.key, s]));
const UA = 'TVBR-Unificada/1.0 (+stremio addon aggregator)';
const INDEX_TTL = 5 * 60 * 1000;
const STREAM_TIMEOUT = Number(process.env.STREAM_TIMEOUT_MS || 8000);
const PAGE = 100;

const OWNER = process.env.GITHUB_OWNER || process.env.VERCEL_GIT_REPO_OWNER || 'fernando02727';
const REPO = process.env.GITHUB_REPO || process.env.VERCEL_GIT_REPO_SLUG || 'tv-br-unificada';
const INDEX_URL = process.env.INDEX_URL || (OWNER && REPO ? `https://raw.githubusercontent.com/${OWNER}/${REPO}/data/index.json` : '');

const EPG_URL = INDEX_URL.replace(/index\.json$/, 'epg.xml.gz');
let cache = { at: 0, data: null };
let lastIndexError = '';
let epgCache = { at: 0, buf: null };
async function loadEpg() {
  if (epgCache.buf && Date.now() - epgCache.at < 15 * 60 * 1000) return epgCache.buf;
  try {
    const r = await fetch(EPG_URL + '?t=' + Math.floor(Date.now() / 600000), { headers: { 'user-agent': UA } });
    if (!r.ok) throw new Error('EPG HTTP ' + r.status);
    epgCache = { at: Date.now(), buf: Buffer.from(await r.arrayBuffer()) };
  } catch (e) {
    if (epgCache.buf) return epgCache.buf;
    const local = path.join(ROOT, 'data', 'epg.xml.gz');
    if (!fs.existsSync(local)) throw e;
    epgCache = { at: Date.now() - 14 * 60 * 1000, buf: fs.readFileSync(local) };
  }
  return epgCache.buf;
}

async function loadIndex(force = false) {
  if (!force && cache.data && Date.now() - cache.at < INDEX_TTL) return cache.data;
  try {
    if (!INDEX_URL) throw new Error('INDEX_URL não definido');
    const r = await fetch(INDEX_URL + '?t=' + Math.floor(Date.now() / 60000), { headers: { 'user-agent': UA } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    data.byId = new Map(data.channels.map(c => [c.id, c]));
    cache = { at: Date.now(), data };
  } catch (e) {
    lastIndexError = `${e.message} (${INDEX_URL || 'sem INDEX_URL'})`;
    if (!cache.data) {
      const local = path.join(ROOT, 'data', 'index.json');
      const data = fs.existsSync(local) ? JSON.parse(fs.readFileSync(local, 'utf8')) : { channels: [], sources: {}, updatedAt: null };
      data.byId = new Map(data.channels.map(c => [c.id, c]));
      cache = { at: Date.now() - INDEX_TTL + 30000, data };
    }
  }
  return cache.data;
}

function manifestUrlOf(src) {
  const m = src.manifest || '';
  return m.startsWith('$ENV:') ? (process.env[m.slice(5)] || '') : m;
}

function manifest() {
  const groups = GROUPS;
  return {
    id: 'community.tvbr.unificada',
    version: '1.0.0',
    name: 'TV BR Unificada',
    description: 'Canais brasileiros ao vivo de vários addons juntos, sem repetição. Cada canal traz as fontes de todos os addons como opções.',
    logo: 'https://raw.githubusercontent.com/Templarian/MaterialDesign/master/svg/television-classic.svg',
    resources: ['catalog', 'meta', 'stream'],
    types: ['tv'],
    idPrefixes: ['brtv:'],
    catalogs: [
      { type: 'tv', id: 'tvbr-todos', name: 'TV BR • Todos', extra: [
        { name: 'search', isRequired: false },
        { name: 'genre', isRequired: false, options: groups },
        { name: 'skip', isRequired: false }
      ] },
      ...groups.map(g => ({ type: 'tv', id: 'tvbr-' + slugify(g), name: 'TV BR • ' + g, extra: [{ name: 'skip', isRequired: false }] }))
    ],
    behaviorHints: { configurable: false, configurationRequired: false }
  };
}

function toPreview(c) {
  const n = new Set(c.srcs.map(s => s[0])).size;
  return {
    id: c.id, type: 'tv', name: c.name,
    poster: c.logo || undefined, logo: c.logo || undefined, posterShape: 'square',
    genres: [c.group],
    description: `${c.srcs.length} opção(ões) de ${n} addon(s): ${[...new Set(c.srcs.map(s => SRC[s[0]]?.name || s[0]))].join(', ')}`
  };
}

function parseExtra(str) {
  const out = {};
  if (!str) return out;
  for (const part of str.split('&')) {
    const i = part.indexOf('=');
    if (i > 0) out[decodeURIComponent(part.slice(0, i))] = decodeURIComponent(part.slice(i + 1));
  }
  return out;
}

async function catalog(id, extra) {
  const idx = await loadIndex();
  let list = idx.channels;
  if (id !== 'tvbr-todos') {
    const g = GROUPS.find(g => 'tvbr-' + slugify(g) === id);
    if (!g) return { metas: [] };
    list = list.filter(c => c.group === g);
  }
  if (extra.genre) list = list.filter(c => c.group === extra.genre);
  if (extra.search) {
    const q = stripAccents(extra.search).toLowerCase().replace(/[^a-z0-9]+/g, '');
    list = list.filter(c => c.key.includes(q) || stripAccents(c.name).toLowerCase().replace(/[^a-z0-9]+/g, '').includes(q));
  }
  const skip = Number(extra.skip || 0);
  return { metas: list.slice(skip, skip + PAGE).map(toPreview), cacheMaxAge: 600 };
}

async function meta(id) {
  const idx = await loadIndex();
  const c = idx.byId.get(id);
  if (!c) return { meta: null };
  return { meta: { ...toPreview(c), background: c.logo || undefined }, cacheMaxAge: 600 };
}

async function fetchStreams(srcKey, itemId) {
  const src = SRC[srcKey];
  if (!src) return [];
  const base = manifestUrlOf(src).replace(/\/manifest\.json(\?.*)?$/, '');
  if (!base) return [];
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), STREAM_TIMEOUT);
  try {
    const r = await fetch(`${base}/stream/tv/${encodeURIComponent(itemId)}.json`, { headers: { 'user-agent': UA }, signal: ctl.signal });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.streams || []).filter(s => s.url || s.ytId || s.infoHash).map(s => ({
      ...s,
      name: `📡 ${src.name}`,
      title: [s.name, s.title || s.description].filter(Boolean).join(' · ').replace(/\n+/g, ' ').slice(0, 120) || src.name,
      behaviorHints: { ...(s.behaviorHints || {}), bingeGroup: 'tvbr-' + srcKey }
    }));
  } catch { return []; }
  finally { clearTimeout(t); }
}

async function stream(id) {
  const idx = await loadIndex();
  const c = idx.byId.get(id);
  if (!c) return { streams: [] };
  const lists = await Promise.all(c.srcs.map(([k, sid]) => fetchStreams(k, sid)));
  const seen = new Set();
  const streams = [];
  for (const l of lists) for (const s of l) {
    const k = s.url || s.externalUrl || s.ytId || s.infoHash || JSON.stringify(s);
    if (seen.has(k)) continue;
    seen.add(k);
    streams.push(s);
  }
  return { streams, cacheMaxAge: 30 };
}

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

async function statusPage(host, msg = '') {
  const idx = await loadIndex(true);
  const manifestUrl = `https://${host}/manifest.json`;
  const actions = OWNER && REPO ? `https://github.com/${OWNER}/${REPO}/actions/workflows/update.yml` : '#';
  const rows = Object.entries(idx.sources || {}).map(([k, s]) =>
    `<tr><td>${esc(s.name)}</td><td class="${s.ok ? 'ok' : 'bad'}">${s.ok ? '● online' : '● fora'}</td><td>${s.count || 0}</td><td class="err">${esc((s.error || '').slice(0, 140))}</td></tr>`).join('');
  const groups = {};
  for (const c of idx.channels || []) groups[c.group] = (groups[c.group] || 0) + 1;
  const when = idx.updatedAt ? new Date(idx.updatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'nunca';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TV BR Unificada</title>
<style>:root{color-scheme:dark}body{font-family:system-ui,sans-serif;background:#0d0f14;color:#e8e8ee;margin:0;padding:24px 16px;max-width:860px;margin:auto}
h1{margin:0 0 4px}small,.err{color:#9aa}.card{background:#161a22;border-radius:12px;padding:16px;margin:16px 0}
a.btn,button{display:inline-block;background:#6c5ce7;color:#fff;border:0;border-radius:8px;padding:10px 16px;text-decoration:none;margin:4px 8px 4px 0;font-size:15px;cursor:pointer}
a.alt{background:#2d3443}table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:6px;border-bottom:1px solid #232a36;text-align:left;vertical-align:top}
.ok{color:#2ecc71}.bad{color:#e74c3c}code{background:#232a36;padding:2px 6px;border-radius:4px;word-break:break-all}.pill{display:inline-block;background:#232a36;border-radius:99px;padding:3px 10px;margin:3px;font-size:13px}</style></head><body>
<h1>📺 TV BR Unificada</h1><small>Última atualização: ${esc(when)} · ${idx.totalChannels || 0} canais únicos (de ${idx.totalItems || 0} entradas)</small>
${msg ? `<div class="card">${msg}</div>` : ''}${lastIndexError ? `<div class="card err">Aviso: usando cópia local do índice (${esc(lastIndexError)})</div>` : ''}
<div class="card"><b>Instalar no Nuvio/Stremio</b><br><a class="btn" href="stremio://${esc(host)}/manifest.json">Instalar</a>
<div style="margin-top:8px">Ou cole este link na aba Addons: <code>${esc(manifestUrl)}</code></div></div>
<div class="card"><b>Guia de programação (XMLTV)</b><br>No Nuvio: Guia → Opções → Adicionar guia XMLTV e cole:<br><code>https://${esc(host)}/epg.xml.gz</code>
<div style="margin-top:6px"><small>${idx.epg ? `${idx.epg.channels} canais com grade real; os demais mostram blocos com o nome do canal.` : 'ainda não gerado'}</small></div></div>
<div class="card"><b>Atualizar</b><br>Atualiza sozinho a cada 1 hora. Para forçar agora:
<br><a class="btn" href="${esc(actions)}" target="_blank">Atualizar agora (GitHub → Run workflow)</a>${process.env.GH_TOKEN && process.env.REFRESH_KEY ? ` <a class="btn alt" href="/atualizar?key=CHAVE">Atualizar com 1 clique (troque CHAVE)</a>` : ''}</div>
<div class="card"><b>Grupos</b> · <a href="/canais" style="color:#a29bfe">ver lista de canais</a><br>${idx.hidden ? `<small>Ocultos: ${idx.hidden.regiao || 0} regionais fora de SP/ES · ${idx.hidden.estrangeiro || 0} estrangeiros · ${idx.hidden.semFonte || 0} sem link funcionando · ${idx.hidden.manual || 0} manuais</small><br>` : ''}${Object.entries(groups).map(([g, n]) => `<span class="pill">${esc(g)}: ${n}</span>`).join('')}</div>
<div class="card"><b>Addons de origem</b><table><tr><th>Addon</th><th>Status</th><th>Canais</th><th>Obs.</th></tr>${rows}</table></div>
</body></html>`;
}

async function triggerRefresh() {
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/update.yml/dispatches`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': UA },
    body: JSON.stringify({ ref: process.env.GITHUB_BRANCH || 'main' })
  });
  return r.status === 204;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const json = (obj, maxAge = 300) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
    res.status(200).send(JSON.stringify(obj));
  };
  try {
    if (p === '/' || p === '/configure') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(await statusPage(host));
    }
    if (p === '/atualizar') {
      let msg;
      if (!process.env.GH_TOKEN || !process.env.REFRESH_KEY) msg = 'Atualização por 1 clique não configurada. Use o botão do GitHub.';
      else if (url.searchParams.get('key') !== process.env.REFRESH_KEY) msg = 'Chave errada.';
      else msg = (await triggerRefresh()) ? '✅ Atualização iniciada! Leva uns 2–3 minutos. Recarregue esta página depois.' : '❌ Não consegui iniciar a atualização.';
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(await statusPage(host, msg));
    }
    if (p === '/manifest.json') return json(manifest(), 3600);
    if (p === '/epg.xml.gz' || p === '/epg.xml') {
      const buf = await loadEpg();
      res.setHeader('Cache-Control', 'public, max-age=1800');
      if (p === '/epg.xml') { res.setHeader('Content-Type', 'application/xml; charset=utf-8'); return res.status(200).send((await import('node:zlib')).gunzipSync(buf)); }
      res.setHeader('Content-Type', 'application/gzip');
      return res.status(200).send(buf);
    }
    if (p === '/canais') {
      const idx = await loadIndex();
      const rows = idx.channels.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.group)}${c.region ? ' · ' + esc(c.region) : ''}</td><td>${c.srcs.length}</td><td>${c.epg ? '✓' : ''}</td><td><code>${esc(c.key)}</code></td></tr>`).join('');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Canais · TV BR</title><style>:root{color-scheme:dark}body{font-family:system-ui;background:#0d0f14;color:#e8e8ee;padding:16px;max-width:900px;margin:auto}table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:5px;border-bottom:1px solid #232a36;text-align:left}code{color:#9aa}</style><h2>${idx.channels.length} canais</h2><p><small>A chave (última coluna) é o que se usa no config.json para renomear, ocultar ou mudar de grupo.</small></p><table><tr><th>Canal</th><th>Grupo</th><th>Fontes</th><th>Grade</th><th>Chave</th></tr>${rows}</table>`);
    }
    let m;
    if ((m = p.match(/^\/catalog\/tv\/([^/]+?)(?:\/(.+?))?\.json$/))) return json(await catalog(m[1], parseExtra(m[2])), 600);
    if ((m = p.match(/^\/meta\/tv\/(.+?)\.json$/))) return json(await meta(m[1]), 600);
    if ((m = p.match(/^\/stream\/tv\/(.+?)\.json$/))) return json(await stream(m[1]), 30);
    res.status(404).json({ error: 'not found' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
