import { isUsed, packCount, type Candidate } from '../../shared/optimizer';
import { localDate, offerState, offerTotal, type PricedProduct } from '../../shared/offers';
import { parseAmount } from '../../shared/units';
import { looselyMatches, matchLevel, wordsOf } from '../../shared/match';
import { normalizeQuery } from '../../shared/text';
import type { Item, Pins, PriceRow, Store } from './types';

/** Gekozen producten per winkel/keten. Leest ook de oude vorm (één keuze per product). */
export function pinsOf(pinned: Item['pinned']): Pins {
  if (!pinned) return {};
  const legacy = pinned as { chain?: string; store_id?: string; product_id?: unknown; title?: string };
  if (typeof legacy.product_id === 'string') {
    const key = legacy.product_id === 'handmatig' ? legacy.store_id : legacy.chain;
    return key ? { [key]: { product_id: legacy.product_id, title: legacy.title ?? '' } } : {};
  }
  return pinned as Pins;
}

/**
 * Welke producten horen bij een lijst-item, per winkel? Per winkel is er hooguit één standaardkeus:
 *  1. het product dat jullie zelf kozen (📌)
 *  2. een eigen prijs met precies deze naam (zelf ingevuld of van een kassabon)
 *  3. een eigen prijs met bijna dezelfde naam ("Melk" ↔ bon "Halfv melk"), als dat er maar één is
 *  4. het product dat de winkel zelf als beste resultaat geeft en waarvan de naam past
 * De rest wordt wel getoond (om uit te kiezen), maar telt niet mee.
 */
export function candidatesFor(item: Item, prices: PriceRow[], stores: Store[], today = localDate()): Candidate[] {
  const q = normalizeQuery(item.name);
  const pins = pinsOf(item.pinned);
  const out: Candidate[] = [];

  const auto = prices
    .filter((p) => !p.household_id && p.query === q && p.chain)
    // Oude rijen (van vóór de opschoning) met online-bundels overslaan
    .filter((p) => !(p.match == null && /volume\s*voordeel/i.test(p.mechanic ?? '')))
    .map((p) => ({ row: p, level: p.match ?? matchLevel(q, p.title) }))
    .sort((a, b) => a.level - b.level || a.row.rank - b.row.rank);
  const own = prices.filter((p) => p.household_id && p.store_id);
  const extraWords = (p: PriceRow) => Math.abs(wordsOf(p.query).length - wordsOf(q).length);

  for (const store of stores.filter((s) => s.enabled)) {
    const list: Candidate[] = [];

    // Eigen prijzen voor deze winkel
    const mine = own.filter((p) => p.store_id === store.id);
    const exact = mine.find((p) => p.query === q);
    const near = mine
      .filter((p) => p.query !== q && (looselyMatches(item.name, p.query) || looselyMatches(item.name, p.title)))
      .sort((a, b) => extraWords(a) - extraWords(b) || (a.fetched_at < b.fetched_at ? 1 : -1));
    if (exact) list.push({ ...toCand(exact, store.id, today), product_id: 'handmatig', pin_key: store.id, learned: true });
    for (const p of near.slice(0, 4)) list.push({ ...toCand(p, store.id, today), product_id: `handmatig:${p.query}`, pin_key: store.id, learned: true });
    const clearNear = near.length === 1 || (near.length > 1 && extraWords(near[0]) < extraWords(near[1]));

    // Automatische prijzen van de keten (AH 't Plateau, AH De Akkers en AH bezorgen delen dezelfde prijzen)
    const rows = store.chain ? auto.filter((a) => a.row.chain === store.chain && (!a.row.online_only || store.online)) : [];
    const best = rows[0]?.level ?? 3;
    const fits = (level: number) => (best <= 1 ? level <= 1 : best === 2 ? level === 2 : false);
    for (const a of rows) list.push({ ...toCand(a.row, store.id, today), pin_key: store.chain!, weak: !fits(a.level) });

    // Standaardkeus voor deze winkel
    const ownPin = pins[store.id] && list.find((c) => c.learned && c.product_id === pins[store.id].product_id);
    const chainPin = store.chain && pins[store.chain] ? list.find((c) => !c.learned && c.product_id === pins[store.chain!].product_id) : undefined;
    // Een eigen keuze (📌) gaat altijd voor.
    const pinned = ownPin ?? chainPin;
    const def =
      pinned ??
      (exact ? list[0] : undefined) ??
      (clearNear ? list.find((c) => c.learned) : undefined) ??
      list.find((c) => !c.learned && !c.weak);
    for (const c of list) {
      c.pinned = c === pinned;
      c.alt = c !== def && !c.weak;
      out.push(c);
    }
  }
  return out;
}

function toCand(p: PriceRow, storeId: string, today: string): Candidate {
  const state = offerState(p, today);
  const base = p.base_price == null ? null : Number(p.base_price);
  const active = state === 'active';
  return {
    store_id: storeId,
    product_id: p.product_id,
    title: p.title,
    size: p.size,
    image_url: p.image_url,
    // Is de actie voorbij of nog niet begonnen, dan geldt de gewone prijs.
    price: active || state === 'none' ? Number(p.price) : (base ?? Number(p.price)),
    base_price: base,
    mechanic: active ? p.mechanic : null,
    offer_until: active ? p.offer_until : null,
    upcoming: state === 'upcoming' ? { mechanic: p.mechanic!, from: p.offer_from!, price: Number(p.price) } : null,
  };
}

// ---------- Wachtlijst: wanneer is een aanbieding een góéde aanbieding? ----------

const regular = (c: Candidate) => c.base_price ?? c.price;
const amountOf = (c: Candidate) => parseAmount(c.size, c.title);
const packsOf = (item: Item) => packCount({ quantity: Number(item.quantity), unit: item.unit });

/** Laagste prijs per stuk die je met de actie kunt krijgen (bij "2 voor 4,99": als je er 2 neemt). */
function offerPiecePrice(p: PricedProduct, packs: number): number {
  let best = Infinity;
  for (let n = packs; n <= packs + 5; n++) best = Math.min(best, offerTotal(p, n) / n);
  return best;
}

export interface OfferCheck {
  cand: Candidate;
  mechanic: string;
  from?: string;                      // begint nog (aangekondigd)
  mine: number;                       // prijs met de actie
  lowest: number;                     // wat je nu al kunt krijgen zonder actie
  per: 'kg' | 'l' | 'st' | null;      // vergeleken per kilo/liter/stuk; null = per verpakking
  versus?: Candidate;                 // het product waarmee vergeleken is
  good: boolean;
}

// Een actie telt als hij niet (noemenswaardig) duurder is dan wat je nu al kunt krijgen.
const TOLERANCE = 1.03;

/**
 * Een actie is pas een goede aanbieding als je er niet duurder mee uit bent dan met wat de app je nu al
 * zou aanraden. "2 voor 4,99" (€ 2,50 per stuk) telt dus niet als er ook knakworst van € 1,29 ligt.
 * Vergelijkt per kilo, liter of stuk als de inhoud bekend is, zodat een groot pak eerlijk meetelt.
 * Hebben jullie zelf een product gekozen (📌), dan telt elke actie op dát product.
 */
function checkOffers(item: Item, cands: Candidate[]): OfferCheck[] {
  const chosen = cands.filter((c) => c.pinned);
  const pool = chosen.length ? chosen : cands.filter((c) => !c.weak);        // acties die in aanmerking komen
  const usual = chosen.length ? chosen : cands.filter(isUsed);               // wat je nu zou kopen, per winkel
  const packs = packsOf(item);
  const out: OfferCheck[] = [];
  for (const c of pool) {
    const mechanic = c.mechanic ?? c.upcoming?.mechanic;
    if (!mechanic) continue;
    const piece = c.mechanic
      ? offerPiecePrice(c, packs)
      : offerPiecePrice({ price: c.upcoming!.price, base_price: c.base_price, mechanic }, packs);
    const a = amountOf(c);
    let lowest = Infinity;
    let versus: Candidate | undefined;
    for (const u of new Set([c, ...usual])) {
      const ua = amountOf(u);
      const price = a && ua && ua.unit === a.unit ? regular(u) / ua.value : !a ? regular(u) : null;
      if (price != null && price < lowest) { lowest = price; versus = u; }
    }
    const mine = a ? piece / a.value : piece;
    out.push({ cand: c, mechanic, from: c.mechanic ? undefined : c.upcoming!.from, mine, lowest, per: a?.unit ?? null, versus, good: mine <= lowest * TOLERANCE });
  }
  return out;
}

/**
 * Wachtlijst: is er nu een goede deal voor dit product?
 * Ja als er nu een goede aanbieding loopt, of als de prijs per stuk onder de richtprijs zit.
 */
export function dealsFor(item: Item, cands: Candidate[]): Candidate[] {
  if (item.target_price != null) {
    const target = Number(item.target_price);
    const packs = packsOf(item);
    const chosen = cands.filter((c) => c.pinned);
    return (chosen.length ? chosen : cands.filter((c) => !c.weak))
      .filter((c) => offerPiecePrice(c, packs) <= target)
      .map((c) => ({ ...c, alt: false }));
  }
  return checkOffers(item, cands).filter((o) => o.good && !o.from).map((o) => ({ ...o.cand, alt: false }));
}

/** Wachtlijst: een goede aanbieding die binnenkort begint ("vanaf maandag"). */
export function upcomingFor(item: Item, cands: Candidate[]): Candidate | undefined {
  return checkOffers(item, cands).filter((o) => o.good && o.from).sort((a, b) => (a.from! < b.from! ? -1 : 1))[0]?.cand;
}

/**
 * Wachtlijst: een actie (nu of binnenkort) die níét telt, omdat je er duurder mee uit bent.
 * Om uit te leggen waarom het product blijft wachten.
 */
export function skippedOffer(item: Item, cands: Candidate[]): OfferCheck | undefined {
  if (item.target_price != null) return undefined;
  const checks = checkOffers(item, cands);
  return checks.some((o) => o.good) ? undefined : checks.sort((a, b) => a.mine / a.lowest - b.mine / b.lowest)[0];
}

const PER: Record<string, string> = { kg: ' per kilo', l: ' per liter', st: ' per stuk' };
/** "€ 6,24 per kilo, terwijl AH Varkens knakworst € 3,23 per kilo kost" */
export function explainSkipped(o: OfferCheck, euro: (n: number) => string): string {
  const per = o.per ? PER[o.per] : '';
  return `${euro(o.mine)}${per}${o.versus && o.versus !== o.cand ? `, terwijl ${o.versus.title} ${euro(o.lowest)}${per} kost` : ''}`;
}

/** Goedkoopste standaardkeus (voor "nu € … bij …" op de wachtlijst). */
export function cheapestUsed(cands: Candidate[]): Candidate | undefined {
  return cands.filter(isUsed).sort((a, b) => a.price - b.price)[0];
}
