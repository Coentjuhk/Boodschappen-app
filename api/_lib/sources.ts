// Prijsbronnen. Let op: dit zijn ONOFFICIËLE koppelingen (dezelfde die de apps van de winkels gebruiken).
// Ze kunnen zonder aankondiging veranderen. Faalt een bron, dan gaat de rest gewoon door.

export interface FoundProduct {
  chain: string;
  product_id: string;
  title: string;
  size?: string | null;
  price: number;
  base_price?: number | null;
  mechanic?: string | null;
  offer_until?: string | null;
  image_url?: string | null;
  url?: string | null;
  rank?: number;
}

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

async function getJson(url: string, init: RequestInit = {}, timeoutMs = 5000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} bij ${new URL(url).host}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// ---------------- Albert Heijn ----------------
let ahToken: { token: string; until: number } | null = null;

async function ahAuth(): Promise<string> {
  if (ahToken && ahToken.until > Date.now()) return ahToken.token;
  const j = await getJson('https://api.ah.nl/mobile-auth/v1/auth/token/anonymous', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Appie/8.22.3', 'x-application': 'AHWEBSHOP' },
    body: JSON.stringify({ clientId: 'appie' }),
  });
  ahToken = { token: j.access_token, until: Date.now() + Math.max(60, (j.expires_in ?? 3600) - 120) * 1000 };
  return ahToken.token;
}

export async function searchAH(query: string, size = 8): Promise<FoundProduct[]> {
  const token = await ahAuth();
  const u = new URL('https://api.ah.nl/mobile-services/product/search/v2');
  u.searchParams.set('query', query);
  u.searchParams.set('sortOn', 'RELEVANCE');
  u.searchParams.set('size', String(size));
  const j = await getJson(u.toString(), {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Appie/8.22.3', 'x-application': 'AHWEBSHOP' },
  });
  const products: any[] = j.products ?? [];
  return products
    .map((p): FoundProduct | null => {
      const base = num(p.priceBeforeBonus);
      const cur = num(p.currentPrice) ?? base;
      if (cur == null) return null;
      const img = [...(p.images ?? [])].sort((a: any, b: any) => Math.abs(a.width - 400) - Math.abs(b.width - 400))[0];
      return {
        chain: 'ah',
        product_id: String(p.webshopId ?? p.hqId ?? p.title),
        title: p.title,
        size: p.salesUnitSize ?? null,
        price: cur,
        base_price: base ?? cur,
        mechanic: p.isBonus ? (p.bonusMechanism ?? 'Bonus') : null,
        offer_until: p.isBonus ? (p.bonusEndDate ?? null) : null,
        image_url: img?.url ?? null,
        url: p.webshopId ? `https://www.ah.nl/producten/product/wi${p.webshopId}` : null,
      };
    })
    .filter((x): x is FoundProduct => !!x)
    .map((x, i) => ({ ...x, rank: i }));
}

// ---------------- Jumbo ----------------
// De oude Jumbo-app-koppeling is afgesloten; we lezen de openbare zoekpagina van jumbo.com.
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mrt: 2, apr: 3, mei: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11 };

function decode(s: string) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** "wo 11 t/m di 17 nov" → "2026-11-17" */
export function jumboUntil(text: string, now = new Date()): string | null {
  const m = text.match(/t\/m\s+(?:[a-z]{2}\s+)?(\d{1,2})\s+([a-z]{3})/i);
  if (!m || MONTHS[m[2].toLowerCase()] == null) return null;
  const month = MONTHS[m[2].toLowerCase()];
  const year = month < now.getMonth() - 6 ? now.getFullYear() + 1 : now.getFullYear();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
}

export function parseJumboHtml(html: string): FoundProduct[] {
  const cards = html.split(/(?=<article)/).filter((c) => c.includes('data-testid="product-price"'));
  const out: FoundProduct[] = [];
  for (const card of cards) {
    const link = card.match(/href="\/producten\/([^"]*?)-([0-9A-Z]+)"/);
    const heading = card.match(/data-testid="jum-heading"[^>]*>([\s\S]*?)<\/(?:h\d|div|span)>/);
    const title = heading ? decode(heading[1]) : null;
    const priceM = decode(card.match(/data-testid="product-price"[\s\S]{0,1500}/)?.[0] ?? '').match(/Prijs:\s*€\s*(\d+),(\d{2})/);
    if (!link || !title || !priceM) continue;
    const price = Number(`${priceM[1]}.${priceM[2]}`);
    const subtitle = card.match(/data-testid="jum-card-subtitle"[^>]*>([\s\S]*?)<\//);
    const tags = [...card.matchAll(/data-testid="jum-tag"[^>]*>([\s\S]*?)<\/(?:span|div)>/g)].map((m) => decode(m[1])).filter(Boolean);
    const sponsored = /gesponsord/i.test(card);
    const dateTag = tags.find((t) => /t\/m/i.test(t));
    // Alleen echte acties ("2 voor 3,99", "1+1 gratis", "25% korting"), geen labels als "Goedkoopje" of "Nieuw"
    const mech = tags.filter((t) => !/gesponsord|t\/m|bezorgkorting/i.test(t) && /\d|gratis|korting|halve|voor/i.test(t)).join(' ').trim() || null;
    const img = card.match(/<img[^>]+src="(https:\/\/[^"]+)"/);
    out.push({
      chain: 'jumbo',
      product_id: link[2],
      title,
      size: subtitle ? decode(subtitle[1]) : null,
      price,
      base_price: price,
      mechanic: mech,
      offer_until: mech && dateTag ? jumboUntil(dateTag) : null,
      image_url: img?.[1] ?? null,
      url: `https://www.jumbo.com/producten/${link[1]}-${link[2]}`,
      rank: sponsored ? 100 + out.length : out.length,
    });
  }
  return out.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)).slice(0, 8).map((x, i) => ({ ...x, rank: i }));
}

export async function searchJumbo(query: string): Promise<FoundProduct[]> {
  const u = new URL('https://www.jumbo.com/producten/');
  u.searchParams.set('searchType', 'keyword');
  u.searchParams.set('searchTerms', query);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch(u, { signal: ctrl.signal, headers: { 'User-Agent': UA, 'Accept-Language': 'nl-NL,nl;q=0.9', Accept: 'text/html' } });
    if (!r.ok) throw new Error(`${r.status} bij jumbo.com`);
    return parseJumboHtml(await r.text());
  } finally {
    clearTimeout(t);
  }
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

export const SOURCES: Record<string, (q: string) => Promise<FoundProduct[]>> = {
  ah: searchAH,
  jumbo: searchJumbo,
};

// Een bron die net faalde slaan we een half uur over, zodat de rest niet op hem hoeft te wachten.
const pausedUntil: Record<string, number> = {};

/** Alle bronnen tegelijk bevragen; fouten worden verzameld i.p.v. alles te laten falen. */
export async function searchAll(query: string, chains = Object.keys(SOURCES)) {
  const errors: Record<string, string> = {};
  const results = await Promise.all(
    chains.filter((c) => SOURCES[c]).map(async (c) => {
      if ((pausedUntil[c] ?? 0) > Date.now()) {
        errors[c] = 'tijdelijk niet bereikbaar';
        return [];
      }
      try {
        return await SOURCES[c](query);
      } catch (e: any) {
        pausedUntil[c] = Date.now() + 30 * 60e3;
        const msg = e?.name === 'AbortError' || /abort/i.test(e?.message ?? '') ? 'reageert niet' : (e?.message ?? String(e));
        errors[c] = msg;
        return [];
      }
    }),
  );
  return { products: results.flat(), errors };
}
