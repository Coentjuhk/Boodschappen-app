import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest } from '@vercel/node';
import { searchAll } from './sources.js';
import { normalizeQuery } from '../../shared/text.js';

let admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY ontbreken in de Vercel-instellingen');
  admin = createClient(url, key, { auth: { persistSession: false } });
  return admin;
}

/** Alleen leden van een huishouden mogen de server-functies gebruiken. */
export async function requireUser(req: VercelRequest) {
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('Niet ingelogd'), { status: 401 });
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Niet ingelogd'), { status: 401 });
  const { count } = await supabaseAdmin().from('members').select('*', { count: 'exact', head: true }).eq('user_id', data.user.id);
  if (!count) throw Object.assign(new Error('Geen lid van een huishouden'), { status: 403 });
  return data.user;
}

// Kolommen die later zijn toegevoegd. Is de database nog niet bijgewerkt, dan slaan we op zonder.
const NEWER_COLUMNS = ['match', 'offer_from'] as const;
const isMissingColumn = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST204' || e.code === '42703' || /column .* does not exist|could not find the .* column/i.test(e.message ?? '');

/** Prijzen voor een zoekterm ophalen bij alle bronnen en opslaan. */
export async function refreshQuery(rawQuery: string) {
  const query = normalizeQuery(rawQuery);
  if (!query) return { query, count: 0, errors: {} as Record<string, string> };
  const { products, errors, answered } = await searchAll(query);
  if (answered.length) {
    const db = supabaseAdmin();
    const now = new Date().toISOString();
    const rows = products.map((p) => ({ ...p, online_only: !!p.online_only, query, household_id: null, fetched_at: now }));
    // Oude resultaten van de winkels die antwoord gaven weg, dan vers erin
    // (ook als een winkel nu niets meer vindt: dan verdwijnt het product van de lijst met prijzen).
    const del = await db.from('prices').delete().is('household_id', null).eq('query', query).in('chain', answered);
    if (del.error) throw del.error;
    if (rows.length) {
      let { error } = await db.from('prices').insert(rows);
      if (error && isMissingColumn(error)) {
        const plain = rows.map((r) => {
          const copy: Record<string, unknown> = { ...r };
          for (const c of NEWER_COLUMNS) delete copy[c];
          return copy;
        });
        ({ error } = await db.from('prices').insert(plain));
      }
      // 23505: een andere telefoon haalde op hetzelfde moment dezelfde prijzen op. Die staan er dan al.
      if (error && error.code !== '23505') throw error;
    }
  }
  return { query, count: products.length, errors };
}
