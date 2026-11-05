// Detecta canais regionais (afiliadas) e decide se ficam visíveis.
import { stripAccents } from './channels.mjs';

const UF_NAMES = {
  AC: ['acre', 'rio branco'], AL: ['alagoas', 'maceio'], AP: ['amapa', 'macapa'], AM: ['amazonas', 'manaus', 'amazonica'],
  BA: ['bahia', 'salvador', 'aratu', 'itapoan', 'feira de santana'], CE: ['ceara', 'fortaleza', 'verdes mares', 'jangadeiro', 'cariri'],
  DF: ['distrito federal', 'brasilia'], ES: ['espirito santo', 'vitoria', 'capixaba', 'cachoeiro', 'linhares', 'colatina', 'vila velha', 'serra es'],
  GO: ['goias', 'goiania', 'anhanguera', 'serra dourada'], MA: ['maranhao', 'sao luis', 'mirante', 'difusora'], MT: ['mato grosso', 'cuiaba', 'centro america', 'noroeste mt'],
  MS: ['mato grosso do sul', 'campo grande', 'morena'], MG: ['minas', 'minas gerais', 'belo horizonte', 'bh', 'alterosa', 'integracao', 'juiz de fora', 'uberlandia', 'uberaba', 'araxa', 'ituiutaba', 'sul de minas', 'triangulo', 'montes claros', 'ipatinga', 'divinopolis', 'zona da mata'],
  PA: ['para', 'belem', 'liberal', 'guajara', 'rbatv', 'santarem'], PB: ['paraiba', 'joao pessoa', 'cabo branco', 'campina grande'], PR: ['parana', 'curitiba', 'rpc', 'londrina', 'maringa', 'foz do iguacu', 'naipi', 'cascavel', 'ponta grossa'],
  PE: ['pernambuco', 'recife', 'guararapes', 'caruaru', 'petrolina', 'grande rio'], PI: ['piaui', 'teresina', 'clube', 'cidade verde'], RJ: ['rio de janeiro', 'rio', 'niteroi', 'inter tv', 'rio sul', 'serra mar', 'campos'],
  RN: ['rio grande do norte', 'natal', 'cabugi', 'inter tv cabugi'], RS: ['rio grande do sul', 'porto alegre', 'rbs', 'pampa', 'caxias'], RO: ['rondonia', 'porto velho', 'allamanda', 'vilhena'],
  RR: ['roraima', 'boa vista'], SC: ['santa catarina', 'florianopolis', 'nsc', 'barriga verde', 'joinville', 'blumenau', 'chapeco'], SE: ['sergipe', 'aracaju'], TO: ['tocantins', 'palmas'],
  SP: ['sao paulo', 'paulista', 'campinas', 'sorocaba', 'bauru', 'ribeirao preto', 'ribeirao', 'rio preto', 'sao jose do rio preto', 'sao jose dos campos', 'sjc', 'taubate', 'tte',
       'santos', 'presidente prudente', 'prudente', 'piracicaba', 'jundiai', 'itapetininga', 'araraquara', 'aracatuba', 'marilia', 'franca', 'sao carlos', 'interior sp', 'guarulhos',
       'tv tem', 'vanguarda', 'fronteira paulista', 'tribuna santos', 'abc', 'vale do paraiba', 'litoral sp', 'baixada santista', 'capital sp']
};

const UF_CODES = Object.keys(UF_NAMES).map(s => s.toLowerCase());
const NETWORK = /^(globo|sbt|record|band|redetv|cultura|rede ?tv)\b/;
const AFFILIATE = /\b(intertv|tv tem|eptv|vanguarda|tribuna|verdes mares|anhanguera|rbs|nsc|rpc|integracao|mirante|liberal|cabo branco|inter tv|rio sul|alterosa|aratu|itapoan|jangadeiro|guararapes|cidade verde|allamanda|naipi|bahia|sergipe|morena|centro america|amazonica|asa branca|clube|gazeta (?!sp)|capixaba|vitoria|diario|fronteira|tropical|cabugi|paraiba)\b/;
const NATIONAL_KEYS = new Set(['globo', 'sbt', 'record', 'band', 'redetv', 'cultura', 'brasil', 'gazeta', 'futura', 'camara', 'senado', 'justica',
  'sbtnacional', 'globointernacional', 'sbtinternacional', 'recordinternacional', 'bandinternacional', 'aparecida', 'redevida', 'cancaonova']);

function norm(s) {
  return ' ' + stripAccents(String(s || '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
}

// Retorna a UF do canal (ex.: 'SP'), 'BR' se nacional, ou null se não dá pra saber
export function regionOf(ch) {
  const n = norm(ch.name);
  const words = new Set(n.trim().split(' '));
  // UF explícita no nome ("Band RN", "SBT PA") ou chave terminada em UF ("globoes")
  for (const uf of UF_CODES) if (words.has(uf)) return uf.toUpperCase();
  let best = null, bestLen = 0;
  for (const [uf, names] of Object.entries(UF_NAMES))
    for (const nm of names) if (nm.length > bestLen && n.includes(' ' + nm + ' ')) { best = uf; bestLen = nm.length; }
  if (best) return best;
  const m = ch.key.match(/^(globo|sbt|record|band|redetv|cultura)([a-z]{2})$/);
  if (m && UF_CODES.includes(m[2])) return m[2].toUpperCase();
  return null;
}

export function isRegional(ch) {
  if (NATIONAL_KEYS.has(ch.key)) return false;
  if (regionOf(ch)) return true;
  const n = norm(ch.name);
  if (NETWORK.test(n.trim()) && !NATIONAL_KEYS.has(ch.key)) return true;
  return AFFILIATE.test(n);
}

// true = mostrar
export function keepByRegion(ch, cfg) {
  const keep = (cfg?.keep || []).map(s => s.toUpperCase());
  const groups = cfg?.applyToGroups || ['Abertos'];
  if (!keep.length || !groups.includes(ch.group)) return true;
  if (!isRegional(ch)) return true;
  const uf = regionOf(ch);
  return uf ? keep.includes(uf) : false;
}

// Canais claramente estrangeiros (EUA, hispânicos etc.) que vêm misturados nas listas
const FOREIGN = /\b(en espa[nñ]ol|hispanic|espanol|usa|us event|us politics|texas|miami|sacramento|baltimore|chicago|boston|denver|phoenix|tucson|nashville|ecuador|paraguay|argentina|neuquen|casanare|cuenca|chile|atacama|colombia|mexico|panregional|cbs|nbc|wfxt|tyc|tigo|bek tv|cheddar|black news|newsmax|scripps|cbn espanol|bein sports xtra|radiovision|radio tv|uniradio|accuweather|akaku|30a)\b/i;
export function isForeign(ch) { return FOREIGN.test(stripAccents(ch.name)); }
