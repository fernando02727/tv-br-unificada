// Nomes padronizados e bonitos para os canais.

// Nome oficial por chave (o que mais importa fica perfeito)
export const CANON = {
  globo: 'Globo', globosp: 'Globo SP', globoes: 'Globo ES (TV Gazeta)', globorj: 'Globo Rio', sbt: 'SBT', sbtsp: 'SBT SP',
  record: 'Record', recordsp: 'Record SP', band: 'Band', bandsp: 'Band SP', bandes: 'Band ES', redetv: 'RedeTV!', cultura: 'TV Cultura',
  brasil: 'TV Brasil', gazeta: 'TV Gazeta', futura: 'Canal Futura', camara: 'TV Câmara', senado: 'TV Senado', justica: 'TV Justiça',
  globonews: 'GloboNews', cnnbrasil: 'CNN Brasil', bandnews: 'BandNews TV', recordnews: 'Record News', jovempan: 'Jovem Pan News',
  premiereclubes: 'Premiere Clubes', sportv: 'SporTV', sportv2: 'SporTV 2', sportv3: 'SporTV 3', sportv4: 'SporTV 4',
  espn: 'ESPN', espn2: 'ESPN 2', espn3: 'ESPN 3', espn4: 'ESPN 4', espn5: 'ESPN 5', espn6: 'ESPN 6', combate: 'Combate', bandsports: 'BandSports',
  cazetv: 'CazéTV', ge: 'ge tv', getv: 'ge tv', dazn: 'DAZN', nsports: 'N Sports', xsports: 'X Sports',
  hbo: 'HBO', hbo2: 'HBO 2', hboplus: 'HBO Plus', hbofamily: 'HBO Family', hbomundi: 'HBO Mundi', hbopop: 'HBO Pop', hboxtreme: 'HBO Xtreme', hbosignature: 'HBO Signature',
  telecinepremium: 'Telecine Premium', telecineaction: 'Telecine Action', telecinepipoca: 'Telecine Pipoca', telecinefun: 'Telecine Fun',
  telecinetouch: 'Telecine Touch', telecinecult: 'Telecine Cult', megapix: 'Megapix', tnt: 'TNT', tntseries: 'TNT Séries', tntnovelas: 'TNT Novelas',
  warner: 'Warner Channel', universal: 'Universal TV', sony: 'Sony Channel', axn: 'AXN', ae: 'A&E', amc: 'AMC', space: 'Space',
  paramount: 'Paramount Network', studiouniversal: 'Studio Universal', cinemax: 'Cinemax', tcm: 'TCM', starchannel: 'Star Channel', canalbrasil: 'Canal Brasil',
  multishow: 'Multishow', gnt: 'GNT', viva: 'Canal Viva', bis: 'BIS', mtv: 'MTV', off: 'Canal OFF', arte1: 'Arte1', comedycentral: 'Comedy Central',
  discovery: 'Discovery Channel', history: 'History', history2: 'History 2', natgeo: 'National Geographic', animalplanet: 'Animal Planet', id: 'Investigação Discovery',
  discoverykids: 'Discovery Kids', cartoonnetwork: 'Cartoon Network', cartoonito: 'Cartoonito', gloob: 'Gloob', gloobinho: 'Gloobinho', nick: 'Nickelodeon',
  nickjr: 'Nick Jr.', disney: 'Disney Channel', tooncast: 'Tooncast', foodnetwork: 'Food Network', hgtv: 'HGTV', tlc: 'TLC', lifetime: 'Lifetime',
  adultswim: 'Adult Swim', primevideo: 'Prime Video', appletv: 'Apple TV+', disneyplus: 'Disney+', paramountplus: 'Paramount+', max: 'Max',
  premiere: 'Premiere', discoveryhomeandhealth: 'Discovery Home & Health', gustavolima: 'Gusttavo Lima', documentaryplus: 'Documentary+', curta: 'Curta!', e: 'E!', sportynet: 'SportyNet', ufcpass: 'UFC Pass', ufc: 'UFC', f1: 'F1 TV', fish: 'Fish TV', canaldoboi: 'Canal do Boi', cnt: 'CNT',
  aparecida: 'TV Aparecida', cancaonova: 'Canção Nova', redevida: 'Rede Vida', globonovelas: 'Globoplay Novelas', rural: 'Canal Rural', terraviva: 'Terraviva'
};

const ACRONYMS = new Set(['TV', 'HD', 'SBT', 'ESPN', 'HBO', 'CNN', 'TNT', 'AXN', 'AMC', 'MTV', 'BIS', 'GNT', 'UFC', 'NBA', 'NFL', 'BBC', 'CNBC', 'DAZN', 'TCM',
  'HGTV', 'TLC', 'FX', 'SP', 'RJ', 'ES', 'MG', 'BA', 'PR', 'RS', 'SC', 'PE', 'CE', 'GO', 'DF', 'PA', 'AM', 'MT', 'MS', 'MA', 'PB', 'RN', 'AL', 'SE', 'PI',
  'TO', 'RO', 'RR', 'AP', 'AC', 'EPTV', 'RBS', 'NSC', 'RPC', 'ABC', 'UHF', 'F1', 'ID', 'CBN', 'RIT', 'NHK', 'DW', 'SIC', 'RTP', 'BM&C', 'TVE', 'SJC']);
const LOWER = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no']);

function smartCase(s) {
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const upper = letters && letters === letters.toUpperCase();
  const lower = letters && letters === letters.toLowerCase();
  if (!upper && !lower) return s; // já tem caixa mista: respeita
  return s.split(/(\s+)/).map((w, i) => {
    if (/^\s+$/.test(w)) return w;
    const W = w.toUpperCase();
    if (ACRONYMS.has(W.replace(/[^A-Z0-9&]/g, ''))) return W;
    const lw = w.toLowerCase();
    if (i > 0 && LOWER.has(lw)) return lw;
    return lw.charAt(0).toUpperCase() + lw.slice(1);
  }).join('');
}

const CITY = [
  ['sao paulo', 'São Paulo'], ['ribeirao preto', 'Ribeirão Preto'], ['ribeirao', 'Ribeirão Preto'], ['sao carlos', 'São Carlos'], ['campinas', 'Campinas'],
  ['sorocaba', 'Sorocaba'], ['itapetininga', 'Itapetininga'], ['bauru', 'Bauru'], ['sj do rio preto', 'Rio Preto'], ['sao jose do rio preto', 'Rio Preto'], ['rio preto', 'Rio Preto'],
  ['sao jose dos campos', 'SJ dos Campos'], ['sjc', 'SJ dos Campos'], ['vale', 'Vale do Paraíba'], ['taubate', 'Taubaté'], ['tte', 'Taubaté'], ['santos', 'Santos'],
  ['fronteira', 'Presidente Prudente'], ['prudente', 'Presidente Prudente'], ['interior', 'Interior SP'], ['paulista', 'Interior SP'], ['jundiai', 'Jundiaí'], ['piracicaba', 'Piracicaba'],
  ['vitoria', 'Vitória'], ['sul es', 'Sul ES'], ['cachoeiro', 'Sul ES'], ['norte', 'Norte ES'], ['capixaba', 'Vitória'], ['espirito santo', 'Vitória'], ['sim', 'Vitória'], ['tribuna', 'Vitória'], [' es', 'Vitória'],
  [' sp', 'São Paulo']
];
const NET_NAME = { globo: 'Globo', sbt: 'SBT', record: 'Record', band: 'Band', redetv: 'RedeTV!', cultura: 'Cultura' };
const GLOBO_AFF = /\b(eptv|tv tem|tem|vanguarda|tribuna santos|fronteira|gazeta)\b/;

// Regionais com padrão "Rede Cidade": "Globo Campinas", "Record Vitória"
export function regionalName(c) {
  const n = ' ' + c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  let net = (c.key.match(/^(globo|sbt|record|band|redetv|cultura)/) || [])[1];
  if (!net && GLOBO_AFF.test(n)) net = 'globo';
  if (!net) return null;
  let city = null;
  for (const [k, label] of CITY) if (n.includes(k.startsWith(' ') ? k + ' ' : ' ' + k + ' ')) { city = label; break; }
  if (!city) city = c.region === 'ES' ? 'ES' : c.region === 'SP' ? 'SP' : null;
  return city ? `${NET_NAME[net]} ${city}` : null;
}

export function fitName(s, max = 24) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1).replace(/\s+\S*$/, '');
  return (cut.length >= 10 ? cut : s.slice(0, max)).replace(/[\s:·\-–]+$/, '');
}

export function prettyName(key, rawName, overrides = {}) {
  if (overrides[key]) return overrides[key];
  if (CANON[key]) return CANON[key];
  const fm = key.match(/^([a-z+]+?)(\d{1,2})$/);
  if (fm && CANON[fm[1]]) return `${CANON[fm[1]]} ${Number(fm[2])}`;
  let s = smartCase(String(rawName || '').trim())
    .replace(/^Globo TV /i, 'Globo ')
    .replace(/\s+0(\d)\b/g, ' $1')
    .replace(/\s+S(\d{2})$/i, (m, n) => ' T' + Number(n))
    .replace(/\s{2,}/g, ' ')
    .trim();
  return fitName(s);
}
