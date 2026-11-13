// POST /api/prices  { queries: string[] }  → haalt actuele prijzen + aanbiedingen op en slaat ze op.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { refreshQuery, requireUser } from './_lib/server.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST' });
    await requireUser(req);
    const queries: string[] = Array.isArray(req.body?.queries) ? req.body.queries.slice(0, 15) : [];
    const results = [];
    // Een paar tegelijk, zodat we binnen de tijdslimiet blijven.
    for (let i = 0; i < queries.length; i += 4) {
      results.push(...(await Promise.all(queries.slice(i, i + 4).map((q) => refreshQuery(String(q))))));
    }
    res.status(200).json({ results });
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message ?? String(e) });
  }
}
