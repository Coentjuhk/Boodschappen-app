// Prijsbronnen. Let op: dit zijn ONOFFICIËLE koppelingen. Ze kunnen zonder aankondiging veranderen.
// Faalt een bron, dan gaat de rest gewoon door.
import { matchLevel, storeTerm, type MatchLevel } from '../../shared/match.js';

export interface FoundProduct {
  chain: string;
  product_id: string;
  title: string;
  size?: string | null;
  price: number;                 // prijs per stuk mét actie (als die een vaste prijs geeft)
  base_price?: number | null;    // prijs zonder actie
  mechanic?: string | null;      // "2 voor 5.00", "1+1 gratis", "40% korting", ...
  offer_from?: string | null;    // actie geldt vanaf (JJJJ-MM-DD); kan in de toekomst liggen
  offer_until?: string | null;
  online_only?: boolean;
  image_url?: string | null;
  url?: string | null;
  rank?: number;                 // volgorde: 0 = beste keus volgens de winkel
  match?: MatchLevel;            // hoe goed het product bij de zoekterm past (zie shared/match.ts)
}

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const KEEP = 8; // zoveel producten bewaren we per winkel per zoekterm

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

type Scored = FoundProduct & { sponsored: boolean; order: number };

// Grootverpakkingen ("6 x 1 L", "voordeelverpakking") zijn zelden wat je bedoelt met "melk".
const isBulk = (p: FoundProduct) => /\b\d+\s*x\s*\d|voordeel\s*(verpakking|pak)|multipack|\b\d+\s*-?\s*pack\b/i.test(`${p.title} ${p.size ?? ''}`);

/** Beste producten eerst: goede naam-match, niet gesponsord, gewone verpakking, dan de volgorde van de winkel. */
function pickBest(found: Scored[]): FoundProduct[] {
  const seen = new Set<string>();
  const unique = found.filter((p) => (seen.has(p.product_id) ? false : (seen.add(p.product_id), true)));
  unique.sort((a, b) =>
    (a.match ?? 3) - (b.match ?? 3) || Number(a.sponsored) - Number(b.sponsored) || Number(isBulk(a)) - Number(isBulk(b)) || a.order - b.order);
  // Twijfelachtige resultaten alleen bewaren als er niets beters is (dan kan de gebruiker zelf kiezen).
  const good = unique.filter((p) => (p.match ?? 3) < 3);
  return (good.length ? good.slice(0, KEEP) : unique.slice(0, 4)).map(({ sponsored: _s, order: _o, ...p }, i) => ({ ...p, rank: i }));
}

// ---------------- Albert Heijn ----------------
let ahToken: { token: string; until: number } | null = null;
const AH_HEADERS = { 'User-Agent': 'Appie/8.22.3', 'x-application': 'AHWEBSHOP' };

async function ahAuth(): Promise<string> {
  if (ahToken && ahToken.until > Date.now()) return ahToken.token;
  const j = await getJson('https://api.ah.nl/mobile-auth/v1/auth/token/anonymous', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...AH_HEADERS },
    body: JSON.stringify({ clientId: 'appie' }),
  });
  ahToken = { token: j.access_token, until: Date.now() + Math.max(60, (j.expires_in ?? 3600) - 120) * 1000 };
  return ahToken.token;
}

const day = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

export function parseAH(j: any, query: string): FoundProduct[] {
  // Categorieën die AH zelf bij deze zoekterm vindt horen ("pasta" → Penne, Spaghetti, Verse pasta, ...)
  const taxonomy = new Set<string>((j?.taxonomyNodes ?? []).map((t: any) => String(t?.name ?? '').toLowerCase()));
  const out: Scored[] = [];
  (j?.products ?? []).forEach((p: any, i: number) => {
    if (p.isVirtualBundle) return;                       // online-bundels ("3-pack, 8% volume voordeel")
    if (p.shopType && p.shopType !== 'AH') return;       // Etos e.d.: ligt niet in de AH-winkel
    if (p.orderAvailabilityStatus && p.orderAvailabilityStatus !== 'IN_ASSORTMENT') return;
    const base = num(p.priceBeforeBonus);
    const cur = num(p.currentPrice) ?? base;
    if (cur == null || !p.title) return;
    const mech: string | null = p.isBonus && !/volume\s*voordeel/i.test(p.bonusMechanism ?? '') ? (p.bonusMechanism || 'Bonus') : null;
    const until = day(p.bonusEndDate);
    const img = [...(p.images ?? [])].sort((a: any, b: any) => Math.abs(a.width - 400) - Math.abs(b.width - 400))[0];
    const sub = String(p.subCategory ?? '');
    out.push({
      chain: 'ah',
      product_id: String(p.webshopId ?? p.hqId ?? p.title),
      title: p.title,
      size: p.salesUnitSize ?? null,
      price: mech ? cur : (base ?? cur),
      base_price: base ?? cur,
      mechanic: mech,
      offer_from: mech ? day(p.bonusStartDate) : null,
      offer_until: mech && until && until < '2100' ? until : null,
      image_url: img?.url ?? null,
      url: p.webshopId ? `https://www.ah.nl/producten/product/wi${p.webshopId}` : null,
      match: matchLevel(query, p.title, sub, !!sub && taxonomy.has(sub.toLowerCase())),
      sponsored: !!p.isSponsored,
      order: i,
    });
  });
  return pickBest(out);
}

export async function searchAH(query: string): Promise<FoundProduct[]> {
  const token = await ahAuth();
  const u = new URL('https://api.ah.nl/mobile-services/product/search/v2');
  u.searchParams.set('query', query);
  u.searchParams.set('sortOn', 'RELEVANCE');
  u.searchParams.set('size', '30');
  return parseAH(await getJson(u.toString(), { headers: { Authorization: `Bearer ${token}`, ...AH_HEADERS } }), query);
}

// ---------------- Jumbo ----------------
// We lezen de openbare zoekpagina van jumbo.com.
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mrt: 2, apr: 3, mei: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11 };

function decode(s: string) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** "wo 11 t/m di 17 nov" → { from: "2026-11-11", until: "2026-11-17" } */
export function jumboPeriod(text: string, now = new Date()): { from: string | null; until: string | null } {
  const m = text.match(/(?:(\d{1,2})(?:\s+([a-z]{3}))?\s+)?t\/m\s+(?:[a-z]{2}\s+)?(\d{1,2})\s+([a-z]{3})/i);
  if (!m || MONTHS[m[4].toLowerCase()] == null) return { from: null, until: null };
  const endMonth = MONTHS[m[4].toLowerCase()];
  // Een actie die eindigt in januari terwijl het nu december is, loopt tot volgend jaar.
  const endYear = endMonth < now.getMonth() - 6 ? now.getFullYear() + 1 : now.getFullYear();
  const until = iso(endYear, endMonth, Number(m[3]));
  if (!m[1]) return { from: null, until };
  let startMonth = m[2] && MONTHS[m[2].toLowerCase()] != null ? MONTHS[m[2].toLowerCase()] : endMonth;
  let startYear = endYear;
  if (!m[2] && Number(m[1]) > Number(m[3])) startMonth -= 1;         // "wo 28 t/m di 3 dec"
  if (startMonth < 0) { startMonth = 11; startYear -= 1; }
  else if (startMonth > endMonth) startYear -= 1;                    // "30 dec t/m 5 jan"
  return { from: iso(startYear, startMonth, Number(m[1])), until };
}

export function parseJumboHtml(html: string, query: string, now = new Date()): FoundProduct[] {
  const cards = html.split(/(?=<article)/).filter((c) => c.includes('data-testid="product-price"'));
  const out: Scored[] = [];
  cards.forEach((card, i) => {
    const link = card.match(/href="\/producten\/([^"]*?)-([0-9A-Z]+)"/);
    const heading = card.match(/data-testid="jum-heading"[^>]*>([\s\S]*?)<\/(?:h\d|div|span)>/);
    const title = heading ? decode(heading[1]) : null;
    const priceM = decode(card.match(/data-testid="product-price"[\s\S]{0,1500}/)?.[0] ?? '').match(/Prijs:\s*€\s*(\d+),(\d{2})/);
    if (!link || !title || !priceM) return;
    const price = Number(`${priceM[1]}.${priceM[2]}`);
    // Maat/gewicht: "<subtitle>Gesponsord • 200 g</subtitle>"
    const subM = card.match(/data-testid="jum-card-subtitle"[^>]*>([\s\S]*?)<\/div>/);
    const size = subM ? decode(subM[1]).replace(/gesponsord/i, '').replace(/^[\s•·]+|[\s•·]+$/g, '') || null : null;
    // Alles tussen de titel en de prijs zijn labels: "Goedkoopje", "2 voor 3,99", "wo 11 t/m di 17 nov", ...
    const from = subM ? subM.index! + subM[0].length : heading!.index! + heading![0].length;
    const labels = card.slice(from, Math.max(from, card.indexOf('data-testid="product-price"')))
      .split(/<[^>]+>/).map(decode).filter(Boolean);
    if (labels.some((t) => /niet leverbaar/i.test(t))) return;
    // Alleen echte acties ("2 voor 3,99", "1+1 gratis", "25% korting"). Geen labels als "Goedkoopje",
    // en geen bezorgkorting ("Bij elke 2 stuks" + "€ 2,50 bezorgkorting").
    const delivery = labels.some((t) => /bezorgkorting/i.test(t));
    const mech = labels
      .filter((t) => !/gesponsord|t\/m|bezorgkorting|alleen online/i.test(t) && !(delivery && /^bij elke/i.test(t)))
      .filter((t) => /\d|gratis|korting|halve/i.test(t))
      .join(' ').trim() || null;
    const period = mech ? jumboPeriod(labels.find((t) => /t\/m/i.test(t)) ?? '', now) : { from: null, until: null };
    const img = card.match(/<img[^>]+src="(https:\/\/[^"]+)"/);
    out.push({
      chain: 'jumbo',
      product_id: link[2],
      title,
      size,
      price,
      base_price: price,
      mechanic: mech,
      offer_from: period.from,
      offer_until: period.until,
      online_only: labels.some((t) => /alleen online/i.test(t)),
      image_url: img?.[1] ?? null,
      url: `https://www.jumbo.com/producten/${link[1]}-${link[2]}`,
      match: matchLevel(query, title),
      sponsored: /gesponsord/i.test(card),
      order: i,
    });
  });
  return pickBest(out);
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
    const html = await r.text();
    // Geen gewone zoekpagina (bv. een controlepagina)? Dan liever een fout dan stilletjes "niets gevonden".
    if (!html.includes('__NUXT__')) throw new Error('onverwacht antwoord van jumbo.com');
    return parseJumboHtml(html, query);
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

// Een bron die net faalde slaan we een kwartier over, zodat de rest niet op hem hoeft te wachten.
const pausedUntil: Record<string, number> = {};

/** Alle bronnen tegelijk bevragen; fouten worden verzameld i.p.v. alles te laten falen. */
export async function searchAll(query: string, chains = Object.keys(SOURCES)) {
  const errors: Record<string, string> = {};
  const answered: string[] = []; // ketens die antwoord gaven (ook als dat "niets gevonden" was)
  const results = await Promise.all(
    chains.filter((c) => SOURCES[c]).map(async (c) => {
      if ((pausedUntil[c] ?? 0) > Date.now()) {
        errors[c] = 'tijdelijk niet bereikbaar';
        return [];
      }
      try {
        const r = await SOURCES[c](storeTerm(query)); // "wc papier" → "toiletpapier"
        answered.push(c);
        return r;
      } catch (e: any) {
        pausedUntil[c] = Date.now() + 15 * 60e3;
        errors[c] = e?.name === 'AbortError' || /abort/i.test(e?.message ?? '') ? 'reageert niet' : (e?.message ?? String(e));
        return [];
      }
    }),
  );
  return { products: results.flat(), errors, answered };
}
