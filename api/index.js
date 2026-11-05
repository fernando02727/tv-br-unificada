// Addon Stremio/Nuvio "TV BR Unificada" — roda como função na Vercel.
import fs from 'node:fs';
import path from 'node:path';
import { GROUPS, slugify, stripAccents } from '../lib/channels.mjs';
import { inspectStream } from '../lib/quality.mjs';

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

function hhmm(t) { return new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); }
// "Agora: Jornal Nacional · 21:30 Novela" a partir da grade guardada no índice
function nowNext(c) {
  const p = c.prog || [];
  const now = Date.now();
  const i = p.findIndex(([a, b]) => a <= now && now < b);
  if (i < 0) return '';
  const cur = p[i], nx = p[i + 1];
  return `Agora: ${cur[2]}${nx ? ` · ${hhmm(nx[0])} ${nx[2]}` : ''}`;
}

function toPreview(c) {
  const n = new Set(c.srcs.map(s => s[0])).size;
  return {
    id: c.id, type: 'tv', name: c.name,
    poster: c.logo || undefined, logo: c.logo || undefined, posterShape: 'square',
    genres: [c.sub || c.group],
    description: nowNext(c) || `${c.sub || c.group} · ${n} fonte(s): ${[...new Set(c.srcs.map(s => SRC[s[0]]?.name || s[0]))].join(', ')}`
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
  list = list.filter(c => eventVisible(c));
  if (extra.genre) list = list.filter(c => c.group === extra.genre || c.sub === extra.genre);
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

async function fetchStreams(srcKey, itemId, deadline) {
  const src = SRC[srcKey];
  if (!src) return [];
  const base = manifestUrlOf(src).replace(/\/manifest\.json(\?.*)?$/, '');
  if (!base) return [];
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), Math.max(500, Math.min(STREAM_TIMEOUT, deadline - Date.now())));
  try {
    const r = await fetch(`${base}/stream/tv/${encodeURIComponent(itemId)}.json`, { headers: { 'user-agent': UA }, signal: ctl.signal });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.streams || []).filter(s => s.url && /^https?:/.test(s.url)).map(s => ({ ...s, _src: srcKey, _pri: src.priority || 99 }));
  } catch { return []; }
  finally { clearTimeout(t); }
}

// Qualidade escrita no nome/título do addon: 2160/1080/720/480
function textHeight(s) {
  const t = `${s.name || ''} ${s.title || ''} ${s.description || ''}`.toLowerCase();
  if (/\b(4k|uhd|2160p?)\b/.test(t)) return 2160;
  if (/\b(fhd|full ?hd|1080p?)\b/.test(t)) return 1080;
  if (/\b(hd|720p?)\b/.test(t)) return 720;
  if (/\b(sd|480p?|360p?)\b/.test(t)) return 480;
  return 0;
}

// Testa o link de verdade (como o app faz, mas antes): mede o tempo de resposta,
// confere se é vídeo ao vivo e lê a resolução da playlist HLS.
async function probe(s, ms) {
  const headers = { 'user-agent': UA, ...(s.behaviorHints?.proxyHeaders?.request || {}) };
  const ctl = new AbortController();
  const t0 = Date.now();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(s.url, { headers, signal: ctl.signal, redirect: 'follow' });
    const ttfb = Date.now() - t0;
    // 401/403/429: servidor bloqueia o NOSSO IP (datacenter/geo), não quer dizer que o link morreu
    if ([401, 403, 407, 429].includes(r.status)) return { alive: 1, ttfb, blocked: r.status };
    if (!r.ok) return { alive: 0, ttfb, status: r.status };
    const reader = r.body.getReader();
    let buf = Buffer.alloc(0);
    while (buf.length < 16384) {
      const { value, done } = await reader.read();
      if (done) break;
      buf = Buffer.concat([buf, Buffer.from(value)]);
    }
    try { ctl.abort(); } catch {}
    const txt = buf.toString('latin1');
    const ts = buf[0] === 0x47 && (buf.length < 189 || buf[188] === 0x47);
    const hls = /#EXTM3U/.test(txt);
    let height = 0, bw = 0;
    for (const m of txt.matchAll(/RESOLUTION=\d+x(\d+)/g)) height = Math.max(height, +m[1]);
    for (const m of txt.matchAll(/BANDWIDTH=(\d+)/g)) bw = Math.max(bw, +m[1]);
    const alive = (ts || (hls && /#EXTINF|#EXT-X-STREAM-INF/.test(txt))) ? 2 : 0;
    return { alive, ttfb, height, bw, live: ts ? 'ts' : hls ? 'hls' : '' };
  } catch { return { alive: 1, ttfb: ms + 1, timeout: true }; }
  finally { clearTimeout(timer); }
}

function qLabel(h) {
  return h >= 2160 ? '4K' : h >= 1080 ? '1080p' : h >= 720 ? '720p' : h > 0 ? 'SD' : 'Auto';
}

const streamCache = new Map();

function eventVisible(c, now = Date.now()) {
  return !c.event || (now >= c.eventStart - 30 * 60e3 && now <= c.eventStart + 3 * 3600e3);
}

async function stream(id) {
  const hit = streamCache.get(id);
  if (hit && Date.now() - hit.at < 20000) return hit.data;
  const idx = await loadIndex();
  const c = idx.byId.get(id);
  if (!c) return { streams: [] };
  const deadline = Date.now() + Number(process.env.LIST_DEADLINE_MS || 3500);
  const t0 = Date.now(), timing = [];
  const lists = await Promise.all(c.srcs.map(async ([k, sid]) => { const l = await fetchStreams(k, sid, deadline); timing.push([k, sid, l.length, Date.now() - t0]); return l; }));
  const seen = new Set();
  const cands = [];
  lists.forEach((l, li) => {
    const [k, sid] = c.srcs[li];
    l.forEach((s, n) => {
      if (seen.has(s.url)) return;
      seen.add(s.url);
      const q = c.q?.[`${k}|${sid}|${n}`] || null;
      cands.push({ s, q });
    });
  });
  // medição real (feita de hora em hora a partir de São Paulo) manda; texto do addon só se não houver medição
  const score = ({ s, q }) => {
    const alive = !q ? 1 : q.ok ? 2 : q.blocked ? 1 : 0;
    const h = q?.h || textHeight(s) || 700;
    const hist = q?.hist || '';
    const stab = hist ? [...hist].filter(x => x === '1').length / hist.length : 0.5;
    return { alive, h, stab, ttfb: q?.ttfb ?? 1500 };
  };
  const ranked = cands.map(x => ({ ...x, sc: score(x) }));
  ranked.sort((a, b) =>
    (b.sc.alive - a.sc.alive) ||
    (b.sc.h - a.sc.h) ||
    (b.sc.stab - a.sc.stab) ||
    (Math.round(a.sc.ttfb / 400) - Math.round(b.sc.ttfb / 400)) ||
    (a.s._pri - b.s._pri));
  const streams = ranked.slice(0, 12).map(({ s, q, sc }) => {
    const src = SRC[s._src];
    const tag = sc.alive === 2 ? (sc.stab >= 0.8 ? '✅ estável' : '⚠️ oscilando') : sc.alive === 0 ? '✕ fora do ar' : '○ não medido';
    const extra = q?.ok ? ` · ${q.codec === 'hevc' ? 'H.265' : 'H.264'}${q.kbps ? ' · ' + (q.kbps / 1000).toFixed(1) + ' Mbps' : ''}` : '';
    const out = {
      url: s.url,
      name: `${qLabel(sc.h)} · ${src?.name || s._src}`,
      title: `${tag}${extra}`,
      behaviorHints: { ...(s.behaviorHints || {}), bingeGroup: 'tvbr-' + s._src }
    };
    if (!out.behaviorHints.proxyHeaders) delete out.behaviorHints.proxyHeaders;
    return out;
  });
  const data = { streams, cacheMaxAge: 20 };
  if (globalThis.__debugProbe) return { ...data, _timing: timing, _hasQ: !!c.q, _index: idx.updatedAt };
  streamCache.set(id, { at: Date.now(), data });
  if (streamCache.size > 300) streamCache.delete(streamCache.keys().next().value);
  return data;
}

// Chamado pela atualização do GitHub: mede (daqui, de São Paulo) a qualidade real
// das fontes de uma lista de canais. Corpo: { channels: [{ id, srcs: [[k, id], ...] }] }
async function medir(body) {
  const out = {};
  const jobs = [];
  for (const ch of (body.channels || []).slice(0, 25)) {
    out[ch.id] = {};
    for (const [k, sid] of ch.srcs || []) {
      if (!SRC[k]) continue;
      jobs.push((async () => {
        const list = await fetchStreams(k, sid, Date.now() + 4000);
        await Promise.all(list.slice(0, 4).map(async (s, n) => {
          const r = await inspectStream(s, 6000);
          out[ch.id][`${k}|${sid}|${n}`] = { ok: !!r.ok, h: r.h || 0, kbps: r.kbps || 0, ttfb: r.ttfb, codec: r.codec || '', blocked: !!r.blocked };
        }));
      })());
    }
  }
  await Promise.all(jobs);
  return out;
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
    if (p === '/medir' && req.method === 'POST') {
      const body = typeof req.body === 'object' && req.body ? req.body : JSON.parse(await new Promise(r => { let d = ''; req.on('data', x => d += x); req.on('end', () => r(d || '{}')); }));
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).send(JSON.stringify(await medir(body)));
    }
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
    if ((m = p.match(/^\/stream\/tv\/(.+?)\.json$/))) {
      globalThis.__debugProbe = url.searchParams.has('debug');
      if (globalThis.__debugProbe) streamCache.delete(m[1]);
      return json(await stream(m[1]), 20);
    }
    res.status(404).json({ error: 'not found' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
