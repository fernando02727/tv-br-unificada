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

export function prettyName(key, rawName, overrides = {}) {
  if (overrides[key]) return overrides[key];
  if (CANON[key]) return CANON[key];
  let s = smartCase(String(rawName || '').trim())
    .replace(/^Globo TV /i, 'Globo ')
    .replace(/\s+0(\d)\b/g, ' $1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return s;
}
