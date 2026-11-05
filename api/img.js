// Converte qualquer logo (WebP, SVG, PNG grande...) em PNG 400x400 com fundo transparente,
// porque a TV (Tizen/SDL) não decodifica WebP/SVG. Uso: /img?u=<url>
import sharp from 'sharp';

const UA = 'TVBR-Unificada/1.0 (+stremio addon aggregator)';

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const u = url.searchParams.get('u') || '';
  if (!/^https?:\/\//.test(u)) return res.status(400).send('u obrigatório');
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'image/*' }, signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return res.status(502).send('origem ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    const png = await sharp(buf, { density: 300 })
      .resize(360, 360, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({ top: 20, bottom: 20, left: 20, right: 20, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=2592000, immutable');
    return res.status(200).send(png);
  } catch (e) {
    return res.status(502).send('falhou: ' + e.message);
  }
}
