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
export async function searchJumbo(query: string, size = 8): Promise<FoundProduct[]> {
  const u = new URL('https://mobileapi.jumbo.com/v17/search');
  u.searchParams.set('q', query);
  u.searchParams.set('offset', '0');
  u.searchParams.set('limit', String(size));
  const j = await getJson(u.toString(), { headers: { 'User-Agent': UA } });
  const data: any[] = j.products?.data ?? [];
  return data
    .map((p): FoundProduct | null => {
      const cents = p.prices?.promotionalPrice?.amount ?? p.prices?.price?.amount;
      const baseCents = p.prices?.price?.amount;
      if (cents == null) return null;
      const promo = p.promotion ?? p.promotions?.[0];
      return {
        chain: 'jumbo',
        product_id: String(p.id),
        title: p.title,
        size: p.quantity ?? null,
        price: cents / 100,
        base_price: baseCents != null ? baseCents / 100 : cents / 100,
        mechanic: promo ? (promo.tags?.[0]?.text ?? promo.name ?? promo.summary ?? 'Aanbieding') : null,
        offer_until: promo?.toDate ? new Date(promo.toDate).toISOString().slice(0, 10) : null,
        image_url: p.imageInfo?.primaryView?.[0]?.url ?? null,
        url: `https://www.jumbo.com/producten/-${p.id}`,
      };
    })
    .filter((x): x is FoundProduct => !!x)
    .map((x, i) => ({ ...x, rank: i }));
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
