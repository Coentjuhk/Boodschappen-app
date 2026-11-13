// GET /api/manifest?code=ABC123 → het app-manifest, met de code van je lijst in het startadres.
// Op de iPhone heeft de app op het beginscherm een eigen geheugen (los van Safari). Met de code in het
// startadres opent hij toch meteen de juiste lijst.
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const raw = String(req.query.code ?? '').toUpperCase();
  const code = /^[A-Z0-9]{4,12}$/.test(raw) ? raw : null;
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(JSON.stringify({
    name: 'Boodschappen',
    short_name: 'Boodschappen',
    description: 'Gedeelde boodschappenlijst met prijzen en aanbiedingen',
    lang: 'nl',
    theme_color: '#1f7a4d',
    background_color: '#f6f5f1',
    display: 'standalone',
    scope: '/',
    start_url: code ? `/?code=${code}` : '/',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  }));
}
