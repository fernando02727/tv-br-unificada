// Subcategorias (o Guia do Nuvio agrupa pelo genre[0]) e ordenação por "família".
import { stripAccents } from './channels.mjs';

const SUB = {
  'Abertos': [
    ['Abertos · Nacionais', c => !c.region],
    ['Abertos · São Paulo', c => c.region === 'SP'],
    ['Abertos · Espírito Santo', c => c.region === 'ES'],
    ['Abertos · Regionais', () => true]
  ],
  'Esportes': [
    ['Esportes · Jogos de Hoje', c => c.event],
    ['Esportes · Premiere', c => /^premiere/.test(c.key)],
    ['Esportes · SporTV', c => /^sportv/.test(c.key)],
    ['Esportes · ESPN', c => /^espn/.test(c.key)],
    ['Esportes · Lutas', c => /combate|ufc|luta|fight|sftcombat/.test(c.key)],
    ['Esportes · Streaming PPV', c => /^(primevideo|appletv|disneyplus|max\d*$|paramountplus|dazn|cazetv|nsports|xsports|getv|ge$|goat|canalgoat|nossofutebol|f1|fifaplus)/.test(c.key)],
    ['Esportes · Mais Esportes', () => true]
  ],
  'Filmes e Séries': [
    ['Filmes · Premium', c => /^(hbo|telecine|megapix|cinemax|tcm|paramount$|studiouniversal|starchannel|canalbrasil|tc[a-z])/.test(c.key)],
    ['Séries · Canais', c => /^(warner|universal|sony|axn|ae$|amc|space|tnt|fx|lifetime|adultswim|comedycentral|globoplaynovelas|tntnovelas|amcseries|universalcrime|storiesbyamc)/.test(c.key)],
    ['Séries · 24 Horas', c => /s\d{2}$|24horas|chaves|chapolin|friends|doishomens|euapatroa|escolinha|trapalhoes|southpark|dramaturgia|classico/.test(c.key)],
    ['Filmes · Cine 24h', c => /^cine|filme|terror|horror|xtrema|runtime|kuriakoscine/.test(c.key)],
    ['Filmes e Séries · Pluto e Grátis', () => true]
  ],
  'Infantil': [
    ['Infantil · Canais', c => /^(cartoon|discoverykids|gloob|nick|disney|tooncast|zoomoo|babytv|baby$|ratimbum|cartoonito|dreamworks)/.test(c.key)],
    ['Infantil · Desenhos 24h', () => true]
  ],
  'Notícias': [['Notícias', () => true]],
  'Documentários': [['Documentários', () => true]],
  'Variedades': [['Variedades', () => true]],
  'Música': [
    ['Música · Canais', c => /^(multishow|bis|mtv|musicbox|trace|stingray|vh1|clubbing)/.test(c.key)],
    ['Música · Artistas e Estilos 24h', () => true]
  ],
  'Religiosos': [['Religiosos', () => true]],
  'Outros': [['Outros', () => true]]
};

export function subgroupOf(c) {
  const list = SUB[c.group] || [[c.group, () => true]];
  for (const [name, test] of list) if (test(c)) return name;
  return c.group;
}

export const SUBGROUP_ORDER = Object.values(SUB).flat().map(([n]) => n);

// "ESPN 4" -> família "espn", número 4. Mantém ESPN, ESPN 2, ESPN 3... juntos.
function family(c) {
  const k = c.key;
  const m = k.match(/^(.*?)(\d+)$/);
  return m ? [m[1], Number(m[2])] : [k, 0];
}

const TOP = ['globo', 'globosp', 'sbt', 'sbtsp', 'record', 'recordsp', 'band', 'bandsp', 'redetv', 'cultura', 'brasil', 'gazeta',
  'premiereclubes', 'premiere', 'sportv', 'espn', 'combate', 'bandsports',
  'globonews', 'cnnbrasil', 'bandnews', 'recordnews', 'jovempan',
  'hbo', 'hboplus', 'hbofamily', 'hbosignature', 'hbomundi', 'hbopop', 'hboxtreme', 'telecinepremium', 'telecineaction', 'telecinepipoca',
  'telecinefun', 'telecinetouch', 'telecinecult', 'megapix', 'cinemax', 'tnt', 'tntseries', 'warner', 'universal', 'sony', 'axn', 'ae', 'amc', 'space',
  'multishow', 'gnt', 'viva', 'discovery', 'history', 'natgeo', 'cartoonnetwork', 'discoverykids', 'gloob', 'nick', 'disney'];

export function sortChannels(list) {
  const rank = new Map(TOP.map((k, i) => [k, i]));
  const subRank = new Map(SUBGROUP_ORDER.map((k, i) => [k, i]));
  return list.sort((a, b) => {
    const sa = subRank.get(a.sub) ?? 999, sb = subRank.get(b.sub) ?? 999;
    if (sa !== sb) return sa - sb;
    if (a.event || b.event) return (a.eventStart || 0) - (b.eventStart || 0);
    const [fa, na] = family(a), [fb, nb] = family(b);
    const ra = Math.min(rank.get(a.key) ?? 9999, rank.get(fa) ?? 9999);
    const rb = Math.min(rank.get(b.key) ?? 9999, rank.get(fb) ?? 9999);
    if (fa === fb) return na - nb;
    if (ra !== rb) return ra - rb;
    return stripAccents(a.name).localeCompare(stripAccents(b.name), 'pt-BR', { numeric: true, sensitivity: 'base' });
  });
}
