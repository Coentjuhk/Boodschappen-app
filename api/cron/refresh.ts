// Dagelijks (zie vercel.json): ververst prijzen en aanbiedingen voor alles wat op een lijst of wachtlijst staat.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { refreshQuery, supabaseAdmin } from '../_lib/server.js';
import { normalizeQuery } from '../../shared/text.js';

export const config = { maxDuration: 60 };

const STALE_MS = 3 * 3600e3;
// Zoektermen die net geprobeerd zijn (ook zonder resultaat) niet meteen opnieuw doen.
const tried = new Map<string, number>();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).end();
  try {
    const db = supabaseAdmin();
    const { data: items, error } = await db.from('items').select('name').eq('checked', false).limit(1000);
    if (error) throw error;
    const all = [...new Set((items ?? []).map((i: { name: string }) => normalizeQuery(i.name)).filter(Boolean))];

    // Alleen wat niet recent is opgehaald. Zo kan dit adres geen kwaad als iemand het vaak aanroept.
    const since = new Date(Date.now() - STALE_MS).toISOString();
    const { data: fresh } = await db.from('prices').select('query').is('household_id', null).gt('fetched_at', since).limit(5000);
    const freshSet = new Set((fresh ?? []).map((r: { query: string }) => r.query));
    const todo = all.filter((q) => !freshSet.has(q) && (tried.get(q) ?? 0) < Date.now() - STALE_MS);

    const started = Date.now();
    let done = 0;
    let failed = 0;
    for (let i = 0; i < todo.length && Date.now() - started < 50_000; i += 4) {
      const batch = todo.slice(i, i + 4);
      const r = await Promise.all(batch.map((q) => refreshQuery(q).catch(() => null)));
      batch.forEach((q) => tried.set(q, Date.now()));
      done += r.filter(Boolean).length;
      failed += r.filter((x) => !x || Object.keys(x.errors).length).length;
    }
    // Automatische prijzen die al een week niet meer ververst zijn opruimen
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    await db.from('prices').delete().is('household_id', null).lt('fetched_at', weekAgo);
    // Bewust geen productnamen in het antwoord: dit adres is openbaar bereikbaar.
    res.status(200).json({ refreshed: done, skipped: all.length - todo.length, remaining: Math.max(0, todo.length - done), withErrors: failed });
  } catch (e: any) {
    res.status(500).json({ error: 'verversen mislukt' });
    console.error('[cron]', e?.message ?? e);
  }
}
