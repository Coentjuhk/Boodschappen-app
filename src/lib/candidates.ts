import type { Candidate } from '../../shared/optimizer';
import { normalizeQuery } from '../../shared/text';
import type { Item, PriceRow, Store } from './types';

/**
 * Welke producten komen in aanmerking voor een lijst-item, per winkel?
 * Automatische prijzen gelden per keten (AH 't Plateau, AH De Akkers en AH bezorgen delen dus dezelfde prijs).
 * We nemen alleen goed passende resultaten: titel bevat alle woorden van het item, anders de top 3 van de zoekopdracht.
 */
export function candidatesFor(item: Item, prices: PriceRow[], stores: Store[]): Candidate[] {
  const q = normalizeQuery(item.name);
  const words = q.split(' ').filter((w) => w.length > 1);
  const rows = prices.filter((p) => p.query === q);
  const out: Candidate[] = [];

  const auto = rows.filter((p) => !p.household_id);
  const byChain = new Map<string, PriceRow[]>();
  for (const p of auto) byChain.set(p.chain!, [...(byChain.get(p.chain!) ?? []), p]);

  for (const [chain, list] of byChain) {
    const matching = list.filter((p) => {
      const t = normalizeQuery(p.title);
      return words.every((w) => t.includes(w));
    });
    const pool = (matching.length ? matching : list).sort((a, b) => a.rank - b.rank).slice(0, matching.length ? 6 : 3);
    // Een vastgepind product altijd meenemen
    const pinned = item.pinned?.chain === chain ? list.find((p) => p.product_id === item.pinned!.product_id) : undefined;
    if (pinned && !pool.includes(pinned)) pool.push(pinned);
    for (const s of stores.filter((s) => s.enabled && s.chain === chain)) {
      for (const p of pool) out.push(toCand(p, s.id, !!pinned && p === pinned));
    }
  }
  for (const p of rows.filter((p) => p.household_id && p.store_id)) {
    const s = stores.find((x) => x.id === p.store_id && x.enabled);
    if (s) out.push(toCand(p, s.id, item.pinned?.store_id === s.id && item.pinned.product_id === 'handmatig'));
  }
  return out;
}

function toCand(p: PriceRow, storeId: string, pinned: boolean): Candidate {
  return {
    store_id: storeId,
    product_id: p.product_id,
    title: p.title,
    size: p.size,
    image_url: p.image_url,
    price: Number(p.price),
    base_price: p.base_price == null ? null : Number(p.base_price),
    mechanic: p.mechanic,
    offer_until: p.offer_until,
    pinned,
  };
}
