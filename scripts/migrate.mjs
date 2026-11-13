// Zet de database automatisch klaar tijdens het bouwen op Vercel.
// Werkt als de Supabase-koppeling van Vercel een databaseadres heeft ingevuld (POSTGRES_URL).
// Het schema is veilig om vaker uit te voeren.
import { readFileSync } from 'node:fs';
import pg from 'pg';

// Eerst het pooler-adres (werkt via IPv4 vanaf Vercel), daarna het directe adres.
const urls = [process.env.POSTGRES_URL, process.env.POSTGRES_URL_NON_POOLING, process.env.DATABASE_URL].filter(Boolean);
if (!urls.length) {
  console.log('[migrate] Geen POSTGRES_URL gevonden: database niet automatisch bijgewerkt (plak supabase/schema.sql zelf in Supabase).');
  process.exit(0);
}

const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
for (const url of urls) {
  const client = new pg.Client({
    connectionString: url.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, ''),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  try {
    await client.connect();
    await client.query(sql);
    console.log('[migrate] Database is bijgewerkt.');
    await client.end();
    process.exit(0);
  } catch (e) {
    // Niet de hele deploy laten mislukken; de app toont dan een duidelijke melding.
    console.warn('[migrate] Poging mislukt:', e.message);
    await client.end().catch(() => {});
  }
}
console.warn('[migrate] Database kon niet automatisch worden bijgewerkt.');
