// Gera um logo bonito (PNG 400x400) para canais sem logo oficial:
// nome do canal sobre um degradê na cor do grupo. Ex.: /logo/chavesclassicot1.png?n=Chaves%20T1&g=Séries
import { ImageResponse } from '@vercel/og';

const COLORS = {
  'Abertos': ['#1e3c72', '#2a5298'], 'Esportes': ['#0b6623', '#1db954'], 'Filmes e Séries': ['#4a0e4e', '#b5179e'],
  'Notícias': ['#7f1d1d', '#dc2626'], 'Infantil': ['#f59e0b', '#f97316'], 'Documentários': ['#14532d', '#65a30d'],
  'Variedades': ['#0e7490', '#06b6d4'], 'Música': ['#581c87', '#9333ea'], 'Religiosos': ['#78350f', '#d97706'], 'Outros': ['#334155', '#64748b']
};

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const name = (url.searchParams.get('n') || 'TV').slice(0, 40);
  const group = url.searchParams.get('g') || 'Outros';
  const top = url.searchParams.get('t') || '';
  const [c1, c2] = COLORS[group] || COLORS.Outros;
  const size = name.length <= 8 ? 92 : name.length <= 14 ? 70 : name.length <= 22 ? 54 : 44;
  const img = new ImageResponse({
    type: 'div',
    props: {
      style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(135deg, ${c1}, ${c2})`, color: 'white', padding: '36px', textAlign: 'center', borderRadius: '48px' },
      children: [
        top ? { type: 'div', props: { style: { fontSize: 64, fontWeight: 700, marginBottom: 18, opacity: 0.95 }, children: top } } : null,
        { type: 'div', props: { style: { fontSize: size, fontWeight: 700, lineHeight: 1.1, display: 'flex', textAlign: 'center' }, children: name } }
      ].filter(Boolean)
    }
  }, { width: 400, height: 400 });
  const buf = Buffer.from(await img.arrayBuffer());
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  res.status(200).send(buf);
}
