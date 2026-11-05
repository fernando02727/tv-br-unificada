// Monta um guia XMLTV próprio: baixa grades públicas, casa com os nossos canais
// pelo nome normalizado e grava epg.xml.gz com os NOMES EXATOS dos nossos canais
// (é assim que o Nuvio casa: pelo nome).
import zlib from 'node:zlib';
import { channelKey, stripAccents } from './channels.mjs';

const UA = 'TVBR-Unificada/1.0 (+stremio addon aggregator)';
const EPG_ALIAS = {
  tcmturnerclassic: 'tcm', turnerclassicmovies: 'tcm', universalchannel: 'universal', paramountchannel: 'paramount',
  historychannel: 'history', discoverytheater: 'discoverytheater', globonews: 'globonews', ebs: 'ebs',
  eentertainmenttelevision: 'e', eentertainment: 'e', tvescola: 'escola', deutschewelle: 'dw', dwtv: 'dw',
  bbcworldnews: 'bbcnews', foxsports: 'foxsports', aparecidaaberta: 'aparecida', aparecidaespelho: 'aparecida',
  thehistorychannel: 'history', aande: 'ae', discoveryhomeehealth: 'discoveryhomeandhealth', travelboxbrasil: 'travelbox'
};
// chaves nossas -> chave da grade (quando o nome do addon é diferente)
const OUR_ALIAS = {
  tcaction: 'telecineaction', tcpipoca: 'telecinepipoca', tcpremium: 'telecinepremium', tcfun: 'telecinefun', tctouch: 'telecinetouch', tccult: 'telecinecult',
  discoveryheh: 'discoveryhomeandhealth', sbtnacional: 'sbt', sbtinternacional: 'sbt', timesbrasilcnbc: 'timesexclusivocnbc', playtv: 'play', sesc: 'sesctv', moviesphere: 'moviespherebylionsgate',
  cnninternacional: 'cnninternational', nickjr: 'nickjr', comedycentral: 'comedycentral'
};
// afiliadas regionais -> grade da rede nacional
function networkOf(key) {
  const m = key.match(/^(globo|sbt|record|band|redetv|cultura)/);
  if (m) return m[1];
  if (/^(tem|eptv|vanguarda|intertv|rbs|nsc|rpc|gazeta.*es$|tribunasantos|fronteira|integracao|anhanguera|mirante|liberal|verdesmares|cabobranco|riosul|morena|centroamerica|bahia)/.test(key)) return 'globo';
  return null;
}

async function download(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  let buf = Buffer.from(await r.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  return buf.toString('utf8');
}

function decodeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function parseTime(t) {
  const m = String(t).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/);
  if (!m) return NaN;
  const [, Y, M, D, h, mi, s = '00', tz = '+0000'] = m;
  const off = (tz[0] === '-' ? -1 : 1) * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3, 5)));
  return Date.UTC(+Y, +M - 1, +D, +h, +mi, +s) - off * 60000;
}

// "São Paulo/SP  HBO HD 2 ³" -> { uf: 'SP', name: 'HBO HD 2' }
function splitRegion(display) {
  const d = decodeXml(display).replace(/[³²¹]/g, ' ').replace(/\s+/g, ' ').trim();
  const m = d.match(/^([^/]{2,40})\/([A-Z]{2})\s+(.+)$/);
  if (m) return { uf: m[2].toLowerCase(), name: m[3] };
  return { uf: '', name: d };
}

export async function buildEpg(channels, cfg = {}, log = console.log, beforeWrite = null) {
  const urls = cfg.sources || [];
  const back = (cfg.hoursBack ?? 6) * 3600e3, ahead = (cfg.hoursAhead ?? 48) * 3600e3;
  const now = Date.now();
  const grid = new Map(); // key -> {srcId, file, score}
  const icons = new Map();
  const files = [];
  for (const url of urls) {
    try { files.push(await download(url)); log(`EPG: ${url} ok`); }
    catch (e) { log(`EPG: falhou ${url}: ${e.message}`); files.push(''); }
  }
  // contar programas por canal (para preferir a grade mais completa)
  const progCount = new Map();
  files.forEach((xml, fi) => {
    for (const m of xml.matchAll(/<programme\b[^>]*\bchannel="([^"]+)"/g)) {
      const k = fi + '|' + m[1];
      progCount.set(k, (progCount.get(k) || 0) + 1);
    }
  });
  files.forEach((xml, fi) => {
    for (const m of xml.matchAll(/<channel\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/channel>/g)) {
      const id = m[1];
      const count = progCount.get(fi + '|' + id) || 0;
      if (!count) continue;
      const icon = (m[2].match(/<icon[^>]*src="([^"]+)"/) || [])[1];
      if (icon) icons.set(fi + '|' + id, decodeXml(icon));
      for (const dn of m[2].matchAll(/<display-name[^>]*>([^<]*)<\/display-name>/g)) {
        const { uf, name } = splitRegion(dn[1]);
        let key = channelKey(name);
        key = EPG_ALIAS[key] || key;
        if (!key) continue;
        const score = count + (uf === 'sp' || !uf ? 100000 : 0);
        const reg = (k, sc) => { const cur = grid.get(k); if (!cur || sc > cur.score) grid.set(k, { srcId: id, fi, score: sc }); };
        reg(key, score);
        if (uf) reg(key + uf, count + 200000);
      }
    }
  });

  const pick = ch => {
    if (cfg.manual?.[ch.id]) return grid.get(cfg.manual[ch.id]) || null;
    const k = OUR_ALIAS[ch.key] || ch.key;
    let g = grid.get(k) || grid.get(k.replace(/(sp)$/, ''));
    if (!g && ch.group === 'Abertos') { const net = networkOf(k); if (net) g = grid.get(net + (ch.region || '').toLowerCase()) || grid.get(net); }
    return g || null;
  };

  const wanted = new Map(); // fi|srcId -> [our channel ids]
  let matched = 0;
  for (const ch of channels) {
    if (ch.event) continue;
    const g = pick(ch);
    if (!g) continue;
    matched++;
    ch.epg = true;
    ch.epgIcon = icons.get(g.fi + '|' + g.srcId);
    const k = g.fi + '|' + g.srcId;
    if (!wanted.has(k)) wanted.set(k, []);
    wanted.get(k).push(ch);
  }

  if (beforeWrite) await beforeWrite();
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<tv generator-info-name="TV BR Unificada">'];
  for (const ch of channels) if (ch.epg) {
    out.push(`<channel id="${escXml(ch.id)}"><display-name lang="pt">${escXml(ch.name)}</display-name>${ch.logo ? `<icon src="${escXml(ch.logo)}"/>` : ''}</channel>`);
  }
  let progs = 0;
  files.forEach((xml, fi) => {
    for (const m of xml.matchAll(/<programme\b([^>]*)>([\s\S]*?)<\/programme>/g)) {
      const attrs = m[1];
      const cid = (attrs.match(/\bchannel="([^"]+)"/) || [])[1];
      const targets = wanted.get(fi + '|' + cid);
      if (!targets) continue;
      const start = parseTime((attrs.match(/\bstart="([^"]+)"/) || [])[1]);
      const stop = parseTime((attrs.match(/\bstop="([^"]+)"/) || [])[1]);
      if (!(stop > now - back) || !(start < now + ahead)) continue;
      const title = decodeXml((m[2].match(/<title[^>]*>([^<]*)<\/title>/) || [])[1] || '').trim();
      for (const ch of targets) {
        if (title && stop > now && start < now + 12 * 3600e3) (ch.prog ||= []).push([start, stop, title.slice(0, 80)]);
        out.push(`<programme${attrs.replace(/\bchannel="[^"]+"/, `channel="${escXml(ch.id)}"`)}>${m[2]}</programme>`);
        progs++;
      }
    }
  });
  // canais sem grade: blocos de 1 h com o nome do canal (some o "Sem grade")
  for (const ch of channels) if (ch.prog) ch.prog = ch.prog.sort((a, b) => a[0] - b[0]).filter((x, i, a) => !i || x[0] >= a[i - 1][1] - 60000).slice(0, 10);
  for (const ch of channels) if (ch.event) ch.prog = [[ch.eventStart, ch.eventStart + 2.5 * 3600e3, ch.eventTitle]];
  if (cfg.filler !== false) {
    const t0 = Math.floor((now - back) / 3600e3) * 3600e3;
    const fmt = t => new Date(t).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000';
    for (const ch of channels) if (!ch.epg) {
      if (ch.event) {
        out.push(`<channel id="${escXml(ch.id)}"><display-name lang="pt">${escXml(ch.name)}</display-name>${ch.logo ? `<icon src="${escXml(ch.logo)}"/>` : ''}</channel>`);
        const st = ch.eventStart, t = escXml(ch.eventTitle);
        const fmt2 = x => new Date(x).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000';
        if (st > now - back) out.push(`<programme start="${fmt2(Math.min(now - back, st - 3600e3))}" stop="${fmt2(st)}" channel="${escXml(ch.id)}"><title lang="pt">Em breve: ${t}</title><category lang="pt">Esportes</category></programme>`);
        out.push(`<programme start="${fmt2(st)}" stop="${fmt2(st + 2.5 * 3600e3)}" channel="${escXml(ch.id)}"><title lang="pt">${t}</title><desc lang="pt">Ao vivo</desc><category lang="pt">Esportes</category></programme>`);
        continue;
      }
      out.push(`<channel id="${escXml(ch.id)}"><display-name lang="pt">${escXml(ch.name)}</display-name>${ch.logo ? `<icon src="${escXml(ch.logo)}"/>` : ''}</channel>`);
      const title = escXml(ch.name), desc = escXml(`${ch.group} · programação ao vivo (este canal não tem grade detalhada)`);
      for (let t = t0; t < now + ahead; t += 3600e3)
        out.push(`<programme start="${fmt(t)}" stop="${fmt(t + 3600e3)}" channel="${escXml(ch.id)}"><title lang="pt">${title}</title><desc lang="pt">${desc}</desc><category lang="pt">${escXml(ch.group)}</category></programme>`);
    }
  }
  out.push('</tv>');
  const gz = zlib.gzipSync(Buffer.from(out.join('\n'), 'utf8'), { level: 9 });
  log(`EPG: ${matched}/${channels.length} canais com programação, ${progs} programas, ${(gz.length / 1024).toFixed(0)} KB`);
  return { gz, matched, programmes: progs };
}

export function _test() { return { splitRegion, parseTime }; }
