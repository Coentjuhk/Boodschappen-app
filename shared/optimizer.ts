// Bepaalt per product in welke winkel je het haalt.
// Modi: 'cheapest' (alle winkels), 'selection' (gekozen winkels), 'single' (één winkel).

import { evaluateOffer, type PricedProduct } from './offers.js';
import { CATEGORY_BY_ID, type StoreKind } from './catalog.js';

export interface OptStore {
  id: string;
  name: string;
  chain?: string | null;
  kinds: StoreKind[] | string[];
  online: boolean;
  delivery_fee: number;
  min_order: number;
}

export interface OptItem {
  id: string;
  name: string;
  quantity: number;
  unit?: string | null;
  category: string;
  store_id?: string | null; // handmatig vastgezet
}

// Bij gewicht/volume ("500 g gehakt") is de prijs per verpakking/portie, niet per gram.
const MEASURE_UNITS = new Set(['g', 'kg', 'ml', 'cl', 'l', 'el', 'tl', 'teen', 'plak']);
export function packCount(item: Pick<OptItem, 'quantity' | 'unit'>): number {
  return item.unit && MEASURE_UNITS.has(item.unit) ? 1 : Math.max(1, Math.ceil(item.quantity));
}

export interface Candidate extends PricedProduct {
  store_id: string;
  product_id: string;
  title: string;
  size?: string | null;
  image_url?: string | null;
  offer_until?: string | null;
  pinned?: boolean;
  /** Twijfelachtige match (naam komt niet overeen): alleen tonen om te kiezen, niet automatisch rekenen. */
  weak?: boolean;
}

export interface Assignment {
  item_id: string;
  store_id: string | null;
  candidate?: Candidate;
  total?: number;          // prijs voor de gevraagde hoeveelheid
  savings?: number;        // t.o.v. normale prijs in dezelfde winkel
  bundleTip?: string;
}

export interface Plan {
  assignments: Record<string, Assignment>;
  stores: string[];        // winkels die je moet bezoeken
  itemsTotal: number;
  fees: number;            // bezorgkosten
  total: number;
  unpriced: number;        // aantal producten zonder bekende prijs
  warnings: string[];
}

export interface OptOptions {
  mode: 'cheapest' | 'selection' | 'single';
  storeIds: string[];          // bij selection/single
  extraStorePenalty: number;   // "hoeveel moet een extra winkel opleveren" in euro
}

function sells(store: OptStore, category: string) {
  const kinds = CATEGORY_BY_ID[category]?.kinds ?? ['supermarkt'];
  return kinds.some((k) => (store.kinds as string[]).includes(k));
}

/** Beste prijs per winkel per product. */
function bestPerStore(item: OptItem, cands: Candidate[]) {
  const out = new Map<string, { cand: Candidate; total: number; perUnit: number; tip?: string }>();
  const pinned = cands.filter((c) => c.pinned);
  for (const c of pinned.length ? pinned : cands.filter((c) => !c.weak)) {
    const ev = evaluateOffer(c, packCount(item));
    const cur = out.get(c.store_id);
    if (!cur || ev.total < cur.total) out.set(c.store_id, { cand: c, total: ev.total, perUnit: ev.perUnit, tip: ev.bundleTip?.text });
  }
  return out;
}

export function plan(items: OptItem[], candidates: Record<string, Candidate[]>, stores: OptStore[], opt: OptOptions): Plan {
  const allowed = opt.mode === 'cheapest' ? stores : stores.filter((s) => opt.storeIds.includes(s.id));
  const pool = opt.mode === 'single' ? allowed.slice(0, 1) : allowed;
  const best = new Map(items.map((i) => [i.id, bestPerStore(i, candidates[i.id] ?? [])]));

  // Alleen winkels die minstens één prijs hebben doen mee in de zoektocht; de rest valt terug op "logische winkel".
  const priced = pool.filter((s) => items.some((i) => best.get(i.id)!.has(s.id)));
  const subsets: OptStore[][] = [];
  if (opt.mode === 'single' || priced.length === 0) subsets.push(priced);
  else {
    const n = Math.min(priced.length, 12);
    for (let mask = 1; mask < 1 << n; mask++) subsets.push(priced.filter((_, i) => mask & (1 << i)));
  }

  let bestPlan: Plan | null = null;
  let bestScore = Infinity;
  for (const subset of subsets) {
    const p = evaluate(items, best, subset, pool, opt);
    // Score: kosten + strafje per extra fysieke winkel + groot strafje voor producten die nergens geprijsd zijn
    const physical = p.stores.filter((id) => !stores.find((s) => s.id === id)?.online).length;
    const score = p.total + Math.max(0, physical - 1) * opt.extraStorePenalty + p.unpriced * 1000;
    if (score < bestScore - 0.001) { bestScore = score; bestPlan = p; }
  }
  return bestPlan ?? evaluate(items, best, [], pool, opt);
}

function evaluate(
  items: OptItem[],
  best: Map<string, Map<string, { cand: Candidate; total: number; perUnit: number; tip?: string }>>,
  subset: OptStore[],
  pool: OptStore[],
  opt: OptOptions,
): Plan {
  const assignments: Record<string, Assignment> = {};
  const used = new Set<string>();
  let itemsTotal = 0;
  let unpriced = 0;
  const warnings: string[] = [];
  const perStoreTotal = new Map<string, number>();

  for (const item of items) {
    const offers = best.get(item.id)!;
    // Handmatig vastgezette winkel gaat altijd voor
    if (item.store_id) {
      const o = offers.get(item.store_id);
      assignments[item.id] = { item_id: item.id, store_id: item.store_id, candidate: o?.cand, total: o?.total, bundleTip: o?.tip, savings: o ? savings(o.cand, packCount(item), o.total) : undefined };
      used.add(item.store_id);
      if (o) { itemsTotal += o.total; perStoreTotal.set(item.store_id, (perStoreTotal.get(item.store_id) ?? 0) + o.total); } else unpriced++;
      continue;
    }
    let pick: { store: OptStore; o: { cand: Candidate; total: number; tip?: string } } | null = null;
    for (const s of subset) {
      const o = offers.get(s.id);
      if (o && (!pick || o.total < pick.o.total)) pick = { store: s, o };
    }
    if (pick) {
      assignments[item.id] = { item_id: item.id, store_id: pick.store.id, candidate: pick.o.cand, total: pick.o.total, bundleTip: pick.o.tip, savings: savings(pick.o.cand, packCount(item), pick.o.total) };
      used.add(pick.store.id);
      itemsTotal += pick.o.total;
      perStoreTotal.set(pick.store.id, (perStoreTotal.get(pick.store.id) ?? 0) + pick.o.total);
    } else {
      // Geen prijs in deze winkelcombinatie: kies een logische fysieke winkel die het verkoopt
      // (liefst eentje waar je toch al heen gaat). Telt als "zonder prijs", zodat een combinatie
      // die wél een prijs heeft de voorkeur krijgt.
      const physical = (s: OptStore) => !s.online && sells(s, item.category);
      const fallback =
        subset.find(physical) ??
        pool.find((s) => used.has(s.id) && physical(s)) ??
        pool.find(physical) ??
        (opt.mode !== 'cheapest' ? pool[0] : undefined);
      assignments[item.id] = { item_id: item.id, store_id: fallback?.id ?? null };
      if (fallback) used.add(fallback.id);
      unpriced++;
    }
  }

  let fees = 0;
  for (const id of used) {
    const s = pool.find((x) => x.id === id);
    if (!s?.online) continue;
    fees += s.delivery_fee;
    const t = perStoreTotal.get(id) ?? 0;
    if (t < s.min_order) warnings.push(`${s.name}: minimaal bestelbedrag ${s.min_order.toFixed(2).replace('.', ',')} (nu ${t.toFixed(2).replace('.', ',')})`);
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return { assignments, stores: [...used], itemsTotal: r(itemsTotal), fees: r(fees), total: r(itemsTotal + fees), unpriced, warnings };
}

function savings(c: Candidate, qty: number, total: number) {
  const base = (c.base_price ?? c.price) * Math.max(1, Math.ceil(qty));
  const s = Math.round((base - total) * 100) / 100;
  return s > 0.004 ? s : undefined;
}
