// Normalização de nomes de canais, agrupamento e ordenação.

const QUALITY = /\b(fhd|uhd|hd|sd|4k|8k|hevc|h\.?265|h\.?264|\d{3,4}p|alt(ernativo)?\s*\d*|backup|reserva|op(cao|ção)?\s*\d+|24h|24\/7|ao vivo|live|direto|latin america|latam|brazil|\(br\)|br)\b/gi;

export function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Nome bonito para exibir
export function displayName(name) {
  let s = String(name || '')
    .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, ' ')
    .replace(/[|•·]+/g, ' ')
    .replace(QUALITY, ' ')
    .replace(/\s+-\s*$/,'')
    .replace(/^[\s:;\-–—•.]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s || String(name || '').trim();
}

const ALIASES = {
  bandeirantes: 'band', tvbandeirantes: 'band', rede: 'redetv',
  globosaopaulo: 'globosp', globoriodejaneiro: 'globorj', globorio: 'globorj',
  premiere: 'premiereclubes', premiere1: 'premiereclubes', premierefc: 'premiereclubes',
  sportv1: 'sportv', espn1: 'espn', hbo1: 'hbo', telecine: 'telecinepremium',
  discoverychannel: 'discovery', nationalgeographic: 'natgeo', natgeographic: 'natgeo',
  cartoon: 'cartoonnetwork', warnerchannel: 'warner', warnertv: 'warner', warnerbros: 'warner',
  disneychannel: 'disney', nickelodeon: 'nick', universaltv: 'universal', universalchannel: 'universal',
  sonychannel: 'sony', paramountnetwork: 'paramount', paramountchannel: 'paramount',
  historychannel: 'history', history1: 'history', investigationdiscovery: 'id', idinvestigacao: 'id',
  investigacaodiscovery: 'id', canalviva: 'viva', foodnetworkbrasil: 'foodnetwork', aee: 'ae',
  tntseriesbrasil: 'tntseries', starchannelbrasil: 'starchannel', globonewsbrasil: 'globonews',
  recordnewsbrasil: 'recordnews', cnnbrasiltv: 'cnnbrasil', jovempannews: 'jovempan',
  canalrural: 'rural', comedycentralbrasil: 'comedycentral', mtvbrasil: 'mtv',
  discoverykidsbrasil: 'discoverykids', tvcultura: 'cultura', redevida: 'redevida',
  amcbrasil: 'amc', axnbrasil: 'axn', tnt1: 'tnt', espnbrasil1: 'espnbrasil', sbtsp: 'sbt',
  recordsp: 'record', caze: 'cazetv', cazetv1: 'cazetv', tcaction: 'telecineaction', tcpipoca: 'telecinepipoca', tcpremium: 'telecinepremium', tcfun: 'telecinefun', tctouch: 'telecinetouch', tccult: 'telecinecult', discoveryheh: 'discoveryhomeandhealth', discoveryhomehealth: 'discoveryhomeandhealth', discoveryhomeehealth: 'discoveryhomeandhealth', gusttavolima: 'gustavolima', sportynet1: 'sportynet', chaves24horas: 'chaves', canalfutura: 'futura', canaloff: 'off', canalviva2: 'viva', recordtv: 'record', sbttv: 'sbt', bandtv: 'band', globotv: 'globo', tvglobo: 'globo', primevideo1: 'primevideo', appletv1: 'appletv', bandsp: 'band', redetvsp: 'redetv'
};

// Chave usada para juntar canais iguais de addons diferentes
export function channelKey(name) {
  let s = stripAccents(String(name || '')).toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/&/g, 'e')
    .replace(/\+/g, ' plus ')
    .replace(QUALITY, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = s.split(' ').filter(Boolean);
  if (words.length > 1 && words[0] === 'tv') words.shift();
  if (words.length > 1 && words[words.length - 1] === 'tv' && words.slice(0, -1).join('') !== 'rede') words.pop();
  let k = words.map(w => /^0+\d/.test(w) ? String(+w) : w).join('');
  k = k.replace(/^(globo|sbt|record|band)tv(?=[a-z])/, '$1');
  k = k.replace(/^amazonprime(video)?/, 'primevideo').replace(/^appletvplus|^appletv\+/, 'appletv');
  if (!k) k = stripAccents(String(name || '')).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const m = k.match(/^(globo|sbt|record|band|redetv|cultura)(.+)$/);
  if (m && UF[m[2]]) k = m[1] + UF[m[2]];
  return ALIASES[k] || k;
}

const UF = { acre: 'ac', alagoas: 'al', amapa: 'ap', amazonas: 'am', bahia: 'ba', ceara: 'ce', distritofederal: 'df', brasilia: 'df',
  espiritosanto: 'es', goias: 'go', maranhao: 'ma', matogrosso: 'mt', matogrossodosul: 'ms', minasgerais: 'mg', minas: 'mg', belohorizonte: 'mg',
  para: 'pa', paraiba: 'pb', parana: 'pr', curitiba: 'pr', pernambuco: 'pe', recife: 'pe', piaui: 'pi', riodejaneiro: 'rj', rio: 'rj',
  riograndedonorte: 'rn', riograndedosul: 'rs', portoalegre: 'rs', rondonia: 'ro', roraima: 'rr', santacatarina: 'sc', saopaulo: 'sp',
  sergipe: 'se', tocantins: 'to', fortaleza: 'ce', salvador: 'ba', goiania: 'go', manaus: 'am', belem: 'pa' };

export const GROUPS = [
  'Abertos', 'Esportes', 'Filmes e Séries', 'Notícias', 'Infantil',
  'Documentários', 'Variedades', 'Música', 'Religiosos', 'Outros'
];

const RULES = [
  ['Abertos', /^(globo(?!news|play|novela|plus)|sbt(?!plus)|record(?!news|plus)|band(?!news|sports|plus)|redetv|rede(globo|record|bahia|amazonica|minas)|cultura$|tvbrasil$|brasil$|gazeta)/],
  ['Religiosos', /aparecida|cancaonova|redevida|novotempo|gospel|evangel|catolic|rit$|^rit|reidade|tvseculo|boaavontade|redesuper|igreja|jesus|biblia/],
  ['Notícias', /news|noticia|globonews|cnn|jovempan|cnbc|bloomberg|euronews|bbc|record ?news|bandnews|timesbrasil|cbn/],
  ['Esportes', /sportv|espn|premiere|combate|bandsports|foxsports|tntsports|dazn|nsports|xsports|cazetv|ufc|nba|nfl|f1|formula|sport|esporte|futebol|goal|eleven|golf|tenis|tennis|primevideo|appletv|paramountplus|max\d|^max$|hbomax|disneyplus|starplus|copa|campeonato|brasileirao|libertadores|uol ?play|canal ?do ?atleta|ge ?tv|fifa|olymp|racing|motor/],
  ['Infantil', /cartoon|discoverykids|nick|gloob|disneyjr|disneyjunior|disney$|boomerang|kids|infantil|baby|tooncast|zoomoo|turmadamonica|pokemon|yugioh|superonze|desenho|anime|jetsons|looney|clubinho|ratimbum|cartoonito/],
  ['Documentários', /discovery|history|natgeo|animalplanet|^id$|investigation|h2|smithsonian|curiosity|science|turbo|documentar|naturetv|travel/],
  ['Música', /mtv|^bis$|multishow|music|musica|hits|radio|stingray|trace|vh1|clubbing|sertanej|funk|pagode|forro|rock/],
  ['Filmes e Séries', /hbo|telecine|megapix|^tnt|tntseries|tntnovelas|space|warner|sony|axn|universal|^ae$|amc|^fx|cinemax|paramount|studiouniversal|starchannel|tcm|canalbrasil|filme|cine|movie|serie|novela|globoplay|lifetime|adultswim|comedy|retro|classic|pluto|sitcom|crime|thriller|terror|horror|acao|action|drama/],
  ['Variedades', /gnt|viva|food|hgtv|tlc|offtv|^off$|arte1|e!|^e$|entretenimento|tastemade|casa|estilo|lifestyle|realit|bbb|fazenda|culinaria|moda|fashion|playboy|sexy|sextreme|venus|fishtv|agro|rural|terraviva|shop|polishop|loja/],
  ['Abertos', /^globo|^sbt|^record|^band$|^band[a-z]{2}$|^redetv|^cultura|gazeta|^brasil$|^tvbrasil|^tvtem|^tem[a-z]|^rbs|^eptv|^nsc|^tvcabo|verdesmares|vanguarda|tribuna|diario|^redetv|^rede(globo|record|bahia|amazonica|minas|massa)|^tvtem|^tv(anhanguera|bahia|globo|record|sergipe|gazeta|asa|integracao|morena|centroamerica|liberal|mirante|clube|cabobranco|paraiba|alagoas|grandeRio|rio|sul|vanguarda|tribuna|diario|fronteira|bandeirantes)|^(anhanguera|bahia|sergipe|integracao|morena|centroamerica|liberal|mirante|cabobranco|paraiba|asa|clube|fronteira|inter|intertv|rpc|rbs|eptv|nsc|amazonas|acre|rondonia|roraima|tocantins|amapa|tem|riosul|aratu|itapoan|jornal|cearense|alterosa|guararapes|difusora|meio|tropical|cidade|verdade)|educativa|camara|senado|justica|^futura$|^sesc|^univesp|^aberto/]
];

const GENRE_HINTS = [
  ['Esportes', /esport|sport|futebol|premiere|ppv|evento/i],
  ['Notícias', /not[ií]cia|news|jornal/i],
  ['Infantil', /infantil|kids|desenho|anima/i],
  ['Documentários', /document|ci[eê]ncia|natureza/i],
  ['Filmes e Séries', /filme|s[eé]rie|cinema|movie|novela|telecine|hbo/i],
  ['Religiosos', /relig|gospel|cat[oó]lic/i],
  ['Música', /m[uú]sica|music|r[aá]dio/i],
  ['Abertos', /abert|globo|sbt|record|band|regional|local/i],
  ['Variedades', /variedad|entreten|lifestyle|reality/i]
];

export function classify(key, hints = []) {
  for (const [g, re] of RULES) if (re.test(key)) return g;
  for (const h of hints) for (const [g, re] of GENRE_HINTS) if (h && re.test(h)) return g;
  return 'Outros';
}

const TOP = ['globo', 'globosp', 'globorj', 'sbt', 'record', 'band', 'redetv', 'cultura', 'tvbrasil', 'gazeta',
  'premiereclubes', 'sportv', 'sportv2', 'sportv3', 'espn', 'espn2', 'espn3', 'espn4', 'espnbrasil', 'combate', 'bandsports',
  'globonews', 'cnnbrasil', 'bandnews', 'recordnews', 'jovempan',
  'hbo', 'hbo2', 'hboplus', 'hbofamily', 'telecinepremium', 'telecineaction', 'telecinepipoca', 'telecinefun', 'telecinetouch', 'telecinecult',
  'megapix', 'tnt', 'tntseries', 'warner', 'universal', 'sony', 'axn', 'ae', 'amc', 'space', 'paramount', 'studiouniversal', 'cinemax',
  'multishow', 'gnt', 'viva', 'discovery', 'history', 'natgeo', 'cartoonnetwork', 'discoverykids', 'gloob', 'nick', 'disney'];

export function sortChannels(list) {
  const rank = new Map(TOP.map((k, i) => [k, i]));
  return list.sort((a, b) => {
    const ra = rank.has(a.key) ? rank.get(a.key) : 9999;
    const rb = rank.has(b.key) ? rank.get(b.key) : 9999;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' });
  });
}

export function slugify(s) {
  return stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
