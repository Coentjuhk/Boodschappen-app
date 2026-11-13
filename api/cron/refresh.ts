// Dagelijks (zie vercel.json): ververst prijzen en aanbiedingen voor alles wat op een lijst staat.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { refreshQuery, supabaseAdmin } from '../_lib/server.js';
import { normalizeQuery } from '../../shared/text.js';

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).end();
  const db = supabaseAdmin();
  const { data: items, error } = await db.from('items').select('name, pinned').eq('checked', false).limit(500);
  if (error) return res.status(500).json({ error: error.message });

  const queries = [...new Set((items ?? []).map((i: any) => normalizeQuery(i.pinned?.query ?? i.name)).filter(Boolean))];
  const started = Date.now();
  const done: string[] = [];
  const errors: Record<string, unknown> = {};
  for (let i = 0; i < queries.length && Date.now() - started < 50_000; i += 4) {
    const batch = queries.slice(i, i + 4);
    const r = await Promise.all(batch.map((q) => refreshQuery(q).catch((e) => ({ query: q, count: 0, errors: { fatal: String(e) } }))));
    for (const x of r) {
      done.push(x.query);
      if (Object.keys(x.errors).length) errors[x.query] = x.errors;
    }
  }
  // Verlopen automatische prijzen opruimen
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  await db.from('prices').delete().is('household_id', null).lt('fetched_at', weekAgo);
  res.status(200).json({ refreshed: done.length, of: queries.length, errors });
}
