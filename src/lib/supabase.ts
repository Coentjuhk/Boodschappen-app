import { createClient } from '@supabase/supabase-js';

declare const __SUPABASE_URL__: string;
declare const __SUPABASE_KEY__: string;
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || __SUPABASE_URL__ || undefined;
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || __SUPABASE_KEY__ || undefined;

export const configured = !!url && !!key;

export const supabase = createClient(url ?? 'https://example.supabase.co', key ?? 'public-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Server-functie aanroepen met het inlogtoken van deze telefoon. */
export async function api<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Fout ${r.status}`);
  return j as T;
}
