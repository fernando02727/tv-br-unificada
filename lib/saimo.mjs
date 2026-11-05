// Lê a lista pública de canais da Saimo TV e aplica o NOSSO filtro de segurança:
// fora hosts que a própria Saimo desativou, links com usuário/senha de painel IPTV,
// conteúdo com DRM e proxies de terceiros. O que sobra é medido como qualquer fonte.
const UA = 'TVBR-Unificada/1.0 (+stremio addon aggregator)';
const CRED = /\/(live|movie|series)\/[^/]+\/[^/]+\/\d+|\/[A-Za-z0-9_]{3,}\/[A-Za-z0-9_]{3,}\/\d+(\.ts|\.m3u8)?$/;

// links "embrulhados" (/relay/<x>/<base64> ou ?url=) escondem o link real, muitas vezes com senha
function unwrap(u) {
  const out = [u];
  try {
    const x = new URL(u);
    for (const v of x.searchParams.values()) if (/^https?:/.test(v)) out.push(v);
    for (const seg of x.pathname.split('/')) {
      if (seg.length < 16) continue;
      try { const d = Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); if (/^https?:\/\//.test(d)) out.push(d); } catch {}
    }
  } catch {}
  return out;
}

export async function readSaimo(src) {
  const base = (src.url || 'https://canais-saimo.pages.dev/').replace(/\/?$/, '/');
  const [txt, des] = await Promise.all([
    fetch(base + 'catalogo.txt', { headers: { 'user-agent': UA } }).then(r => r.text()),
    fetch(src.blocklist || 'https://saimo-tv.pages.dev/fontes-desativadas.json', { headers: { 'user-agent': UA } }).then(r => r.json()).catch(() => ({ desativados: [] }))
  ]);
  const blocked = new Set(des.desativados || []);
  const extraBlock = new Set(src.blockHosts || []);
  const chans = []; let cur = null;
  for (const line of txt.split(/\r?\n/)) {
    const m = line.trim().match(/^(canal|logo|categoria|fonte|qualidade|referer|agente|chave|nome):\s*(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'canal') { cur = { name: v.trim(), logo: '', cat: '', streams: [] }; chans.push(cur); }
    else if (!cur) continue;
    else if (k === 'fonte') cur.streams.push({ url: v.trim() });
    else if (k === 'logo') cur.logo = v.trim();
    else if (k === 'categoria') cur.cat = v.trim();
    else if (cur.streams.length) cur.streams[cur.streams.length - 1][k] = v.trim();
  }
  const stats = { total: 0, desativado: 0, senha: 0, drm: 0, proxy: 0, ok: 0 };
  const items = [], data = {};
  for (const c of chans) {
    const ok = [];
    for (const s of c.streams) {
      stats.total++;
      let host = '';
      try { host = new URL(s.url).hostname; } catch { continue; }
      if (blocked.has(host) || extraBlock.has(host)) { stats.desativado++; continue; }
      if (unwrap(s.url).some(x => CRED.test(x))) { stats.senha++; continue; }
      if (/\.(html?|php)(\?|$)/i.test(s.url)) { stats.proxy++; continue; }
      if (s.chave) { stats.drm++; continue; }
      if (/proxy/i.test(host) && /workers\.dev$/.test(host)) { stats.proxy++; continue; }
      stats.ok++;
      ok.push({ url: s.url, title: s.nome || '', referer: s.referer || '', ua: s.agente || '' });
    }
    if (!ok.length) continue;
    const id = 'saimo:' + c.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (data[id]) { data[id].push(...ok); continue; }
    data[id] = ok;
    items.push({ id, name: c.name, logo: c.logo, genres: c.cat ? [c.cat] : [], catName: c.cat || 'Saimo' });
  }
  return { items, data, stats };
}
