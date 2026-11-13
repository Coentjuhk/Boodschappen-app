import { describe, expect, it } from 'vitest';
import { candidatesFor, cheapestUsed, dealsFor, pinsOf, upcomingFor } from '../src/lib/candidates';
import { isUsed } from '../shared/optimizer';
import { matchLevel, looselyMatches, stem, storeTerm } from '../shared/match';
import type { Item, PriceRow, Store } from '../src/lib/types';

const H = 'hh';
const store = (id: string, chain: string | null, extra: Partial<Store> = {}): Store =>
  ({ id, household_id: H, name: id, chain, kinds: ['supermarkt'], location: null, online: false, delivery_fee: 0, min_order: 0, enabled: true, sort: 0, ...extra });
const stores = [store('ah1', 'ah'), store('ah2', 'ah'), store('lidl', 'lidl'), store('jumbo-web', 'jumbo', { online: true })];
const item = (name: string, extra: Partial<Item> = {}): Item =>
  ({ id: 'i', household_id: H, name, quantity: 1, unit: null, note: null, category: 'overig', store_id: null, pinned: null, checked: false, wait_offer: false, target_price: null, added_by: null, source: null, created_at: '', updated_at: '', ...extra });
let n = 0;
const auto = (chain: string, query: string, title: string, price: number, extra: Partial<PriceRow> = {}): PriceRow =>
  ({ id: 'p' + n++, household_id: null, chain, store_id: null, query, product_id: title, title, size: null, price, base_price: price, mechanic: null, offer_until: null, online_only: false, image_url: null, url: null, rank: n, fetched_at: '2026-11-13T10:00:00Z', match: 0, ...extra });
const mine = (storeId: string, query: string, price: number, title = query): PriceRow =>
  ({ ...auto('x', query, title, price), household_id: H, chain: null, store_id: storeId, product_id: 'handmatig', match: null });
const today = '2026-11-13';
const used = (cs: ReturnType<typeof candidatesFor>, storeId: string) => cs.filter((c) => c.store_id === storeId && isUsed(c));

describe('woorden vergelijken', () => {
  it('stam', () => {
    expect(stem('bananen')).toBe(stem('banaan'));
    expect(stem('peren')).toBe(stem('peer'));
    expect(stem('eieren')).toBe('ei');
    expect(stem('uien')).toBe(stem('ui'));
    expect(stem('wortels')).toBe(stem('wortel'));
    expect(stem('druiven')).toBe(stem('druif'));
    expect(stem('kaas')).toBe('kas'); // de -s hoort bij het woord
    expect(stem('vlees')).not.toBe(stem('vlee'));
  });
  it('niveau', () => {
    expect(matchLevel('melk', 'AH Halfvolle melk')).toBe(0);
    expect(matchLevel('bananen', 'AH Banaan')).toBe(0);
    expect(matchLevel('pasta', 'AH Penne', 'Penne, rigatoni', true)).toBe(1);
    expect(matchLevel('kaas', 'Zaanse Hoeve Mild geraspt', 'Geraspte kaas')).toBe(1);
    expect(matchLevel('melk', 'AH Kokosmelk')).toBe(2);
    expect(matchLevel('kattenvoer', 'Julia Kattenbak Zakken')).toBe(3);
    expect(storeTerm('WC-papier')).toBe('toiletpapier');
    expect(matchLevel('wc papier', 'Jumbo Toiletpapier Zacht & Sterk 3 Laags')).toBe(0);
  });
  it('bonnamen', () => {
    expect(looselyMatches('Halfvolle melk', 'HALFV MELK 1L')).toBe(true);
    expect(looselyMatches('Melk', 'halfvolle melk')).toBe(true);
    expect(looselyMatches('Kaas', 'pindakaas')).toBe(false);
    expect(looselyMatches('Brood', 'broodjes')).toBe(false);
  });
});

describe('productkeuze per winkel', () => {
  const prices = [
    auto('ah', 'melk', 'AH Halfvolle melk', 1.29),
    auto('ah', 'melk', 'AH Halfvolle melk klein', 0.79),
    auto('ah', 'melk', 'AH Kokosmelk', 0.5, { match: 2 }),
    auto('jumbo', 'melk', 'Jumbo Melk', 1.19),
  ];
  it('neemt het eerste passende product, niet het goedkoopste', () => {
    const cs = candidatesFor(item('Melk'), prices, stores, today);
    expect(used(cs, 'ah1').map((c) => c.title)).toEqual(['AH Halfvolle melk']);
    expect(used(cs, 'ah2')).toHaveLength(1); // beide AH-winkels delen de prijs
    expect(cs.find((c) => c.title === 'AH Kokosmelk')).toMatchObject({ weak: true });
    expect(used(cs, 'jumbo-web')).toHaveLength(1);
    expect(used(cs, 'lidl')).toHaveLength(0);
  });
  it('twijfelachtige resultaten tellen niet mee', () => {
    const cs = candidatesFor(item('Kattenvoer'), [auto('jumbo', 'kattenvoer', 'Kattenbak zakken', 0.99, { match: 3 })], stores, today);
    expect(cs).toHaveLength(1);
    expect(cs.filter(isUsed)).toHaveLength(0);
  });
  it('eigen keuze per keten laat andere winkels meedoen', () => {
    const it2 = item('Melk', { pinned: { ah: { product_id: 'AH Halfvolle melk klein', title: 'x' } } });
    const cs = candidatesFor(it2, prices, stores, today);
    expect(used(cs, 'ah1')[0]).toMatchObject({ title: 'AH Halfvolle melk klein', pinned: true });
    expect(used(cs, 'jumbo-web')[0].title).toBe('Jumbo Melk');
  });
  it('leest de oude vorm van een keuze', () => {
    expect(pinsOf({ chain: 'ah', product_id: '123', title: 'x' })).toEqual({ ah: { product_id: '123', title: 'x' } });
    expect(pinsOf({ store_id: 's1', product_id: 'handmatig', title: 'x' })).toEqual({ s1: { product_id: 'handmatig', title: 'x' } });
    expect(pinsOf(null)).toEqual({});
  });
  it('eigen prijs met dezelfde naam gaat voor de automatische', () => {
    const cs = candidatesFor(item('Melk'), [...prices, mine('ah1', 'melk', 1.1)], stores, today);
    expect(used(cs, 'ah1')[0]).toMatchObject({ price: 1.1, learned: true });
    expect(used(cs, 'ah2')[0].price).toBe(1.29);
  });
  it('bonprijs met bijna dezelfde naam telt als het er één is', () => {
    const one = candidatesFor(item('Melk'), [mine('lidl', 'halfv melk 1l', 0.99, 'Halfv melk 1l')], stores, today);
    expect(used(one, 'lidl')[0]).toMatchObject({ price: 0.99, learned: true });
    const two = candidatesFor(item('Melk'), [mine('lidl', 'halfvolle melk', 0.99), mine('lidl', 'chocolade melk', 1.49)], stores, today);
    expect(used(two, 'lidl')).toHaveLength(0);                       // onduidelijk welke: eerst kiezen
    expect(two.filter((c) => c.store_id === 'lidl')).toHaveLength(2); // wel zichtbaar
    const chosen = candidatesFor(item('Melk', { pinned: { lidl: { product_id: 'handmatig:halfvolle melk', title: '' } } }), [mine('lidl', 'halfvolle melk', 0.99), mine('lidl', 'chocolade melk', 1.49)], stores, today);
    expect(used(chosen, 'lidl')[0].price).toBe(0.99);
  });
  it('alleen-online producten niet in de fysieke winkel', () => {
    const cs = candidatesFor(item('Melk'), [auto('jumbo', 'melk', 'Jumbo Melk online', 1, { online_only: true })], [store('jumbo-winkel', 'jumbo'), ...stores], today);
    expect(cs.map((c) => c.store_id)).toEqual(['jumbo-web']);
  });
  it('negeert oude rijen met online-bundels', () => {
    const cs = candidatesFor(item('Melk'), [auto('ah', 'melk', 'Melk 3-pack', 5.1, { match: null, mechanic: '5% volume voordeel' })], stores, today);
    expect(cs).toHaveLength(0);
  });
});

describe('acties in de tijd', () => {
  const bonus = (from: string, until: string) => auto('ah', 'knakworsten', 'Unox Knaks', 2.89, { mechanic: '2 voor 4.99', offer_from: from, offer_until: until });
  it('actie die nog moet beginnen telt niet, maar wordt wel aangekondigd', () => {
    const cs = candidatesFor(item('Knakworsten', { wait_offer: true }), [bonus('2026-11-16', '2026-11-22')], stores, today);
    expect(cs[0]).toMatchObject({ mechanic: null, price: 2.89, upcoming: { mechanic: '2 voor 4.99', from: '2026-11-16' } });
    expect(dealsFor(item('Knakworsten', { wait_offer: true }), cs)).toHaveLength(0);
    expect(upcomingFor(cs)?.upcoming?.from).toBe('2026-11-16');
  });
  it('lopende actie is een deal', () => {
    const cs = candidatesFor(item('Knakworsten', { wait_offer: true }), [bonus('2026-11-09', '2026-11-15')], stores, today);
    expect(dealsFor(item('Knakworsten', { wait_offer: true }), cs).length).toBeGreaterThan(0);
  });
  it('verlopen actie telt niet meer en gebruikt de gewone prijs', () => {
    const row = auto('ah', 'kaas', 'Kaas', 1.99, { base_price: 2.99, mechanic: 'VOOR 1.99', offer_from: '2026-11-02', offer_until: '2026-11-08' });
    const cs = candidatesFor(item('Kaas'), [row], stores, today);
    expect(cs[0]).toMatchObject({ mechanic: null, price: 2.99 });
  });
  it('richtprijs en eigen keuze', () => {
    const rows = [auto('ah', 'scheermesjes', 'Gillette Mach3 scheermesjes', 17.99), auto('ah', 'scheermesjes', 'Care scheermesjes', 2.99, { mechanic: '2e halve prijs' })];
    const wait = item('Scheermesjes', { wait_offer: true });
    expect(dealsFor(wait, candidatesFor(wait, rows, stores, today)).map((c) => c.title)).toContain('Care scheermesjes');
    const pinnedItem = { ...wait, pinned: { ah: { product_id: 'Gillette Mach3 scheermesjes', title: '' } } };
    expect(dealsFor(pinnedItem, candidatesFor(pinnedItem, rows, stores, today))).toHaveLength(0); // alleen het gekozen product telt
    const target = { ...pinnedItem, target_price: 18 };
    expect(dealsFor(target, candidatesFor(target, rows, stores, today)).length).toBeGreaterThan(0);
    expect(cheapestUsed(candidatesFor(pinnedItem, rows, stores, today))?.price).toBe(17.99);
  });
});
