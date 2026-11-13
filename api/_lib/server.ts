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

/** Prijzen voor een zoekterm ophalen bij alle bronnen en opslaan. */
export async function refreshQuery(rawQuery: string) {
  const query = normalizeQuery(rawQuery);
  if (!query) return { query, count: 0, errors: {} };
  const { products, errors } = await searchAll(query);
  if (products.length) {
    const now = new Date().toISOString();
    const rows = products.map((p) => ({ ...p, query, household_id: null, fetched_at: now }));
    // Oude resultaten voor deze zoekterm weg, dan vers erin (producten kunnen uit het assortiment zijn).
    const chains = [...new Set(products.map((p) => p.chain))];
    await supabaseAdmin().from('prices').delete().is('household_id', null).eq('query', query).in('chain', chains);
    const { error } = await supabaseAdmin().from('prices').insert(rows);
    if (error) throw error;
  }
  return { query, count: products.length, errors };
}
