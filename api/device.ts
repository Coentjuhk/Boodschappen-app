// POST /api/device → maakt een account voor deze telefoon aan.
// Alleen nodig als "anonymous sign-ins" in Supabase uit staat; dan hoef je daar niets voor in te stellen.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes, randomUUID } from 'node:crypto';
import { supabaseAdmin } from './_lib/server.js';

// Dit adres is openbaar. Een bovengrens voorkomt dat iemand eindeloos accounts kan laten aanmaken.
const MAX_DEVICES = 200;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST' });
  try {
    const db = supabaseAdmin();
    const list = await db.auth.admin.listUsers({ page: 1, perPage: MAX_DEVICES });
    if (!list.error && list.data.users.length >= MAX_DEVICES) {
      return res.status(429).json({ error: 'Te veel apparaten aangemeld. Ruim oude gebruikers op in Supabase (Authentication → Users).' });
    }
    const email = `telefoon-${randomUUID()}@boodschappen.invalid`;
    const password = randomBytes(24).toString('base64url');
    const { error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    res.status(200).json({ email, password });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? String(e) });
  }
}
