import { describe, expect, it } from 'vitest';
import { candidatesFor, cheapestUsed, dealsFor, explainSkipped, pinsOf, skippedOffer, upcomingFor } from '../src/lib/candidates';
import { parseAmount } from '../shared/units';
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
    expect(upcomingFor(item('Knakworsten', { wait_offer: true }), cs)?.upcoming?.from).toBe('2026-11-16');
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

describe('goede aanbieding of niet', () => {
  const wait = item('Knakworst', { wait_offer: true });
  const euro = (x: number) => '€' + x.toFixed(2);
  // Volgorde = volgorde van de winkel: het eerste product is wat de app nu zou aanraden.
  const cheap = () => auto('ah', 'knakworst', 'AH Varkens knakworst', 1.29, { size: '400 g' });
  const unox = (extra: Partial<PriceRow> = {}) => auto('ah', 'knakworst', 'Unox Knaks', 2.89, { size: '400 g', mechanic: '2 voor 4.99', ...extra });
  const running = { offer_from: '2026-11-09', offer_until: '2026-11-15' };
  const nextWeek = { offer_from: '2026-11-16', offer_until: '2026-11-22' };

  it('inhoud van verpakkingen', () => {
    expect(parseAmount('400 g')).toEqual({ value: 0.4, unit: 'kg' });
    expect(parseAmount('1,5 l')).toEqual({ value: 1.5, unit: 'l' });
    expect(parseAmount('6 x 200 ml')?.value).toBeCloseTo(1.2);
    expect(parseAmount('4 + 2 stuks')).toEqual({ value: 6, unit: 'st' });
    expect(parseAmount('ca. 1006 g')?.value).toBeCloseTo(1.006);
    expect(parseAmount('per stuk')).toEqual({ value: 1, unit: 'st' });
    expect(parseAmount(null, 'Jumbo Knakworst 10 Stuks')).toEqual({ value: 10, unit: 'st' });
    expect(parseAmount(null, 'Jumbo Luiers Maat 5 11-16 kg 31 Stuks')).toEqual({ value: 31, unit: 'st' }); // niet "16 kg"
    expect(parseAmount(null, 'Pampers Premium Protection Maat 4, 78 Luiers')).toEqual({ value: 78, unit: 'st' });
    expect(parseAmount(null, 'AH Goudse jong 48+ plakken')).toBeNull();
    expect(parseAmount('400 g', 'Jumbo Knakworst 10 Stuks')).toEqual({ value: 0.4, unit: 'kg' }); // maat gaat voor
  });

  it('actie die duurder is dan wat je nu al kunt krijgen telt niet (knakworst)', () => {
    // 2 voor 4,99 = € 2,50 per stuk, terwijl er knakworst van € 1,29 ligt
    const cs = candidatesFor(wait, [cheap(), unox(running)], stores, today);
    expect(dealsFor(wait, cs)).toHaveLength(0);
    const skipped = skippedOffer(wait, cs)!;
    expect(skipped).toMatchObject({ mechanic: '2 voor 4.99', per: 'kg', good: false });
    expect(skipped.cand.title).toBe('Unox Knaks');
    expect(skipped.mine).toBeCloseTo(6.2375);   // per kilo met de actie
    expect(skipped.lowest).toBeCloseTo(3.225);  // per kilo: AH Varkens knakworst
    expect(explainSkipped(skipped, euro)).toBe('€6.24 per kilo, terwijl AH Varkens knakworst €3.23 per kilo kost');
  });
  it('ook een aangekondigde actie wordt alleen genoemd als hij voordelig is', () => {
    const cs = candidatesFor(wait, [cheap(), unox(nextWeek)], stores, today);
    expect(upcomingFor(wait, cs)).toBeUndefined();
    expect(skippedOffer(wait, cs)).toMatchObject({ from: '2026-11-16', good: false });
  });
  it('actie die onder de gewone prijs komt telt wél, ook als hij nog moet beginnen', () => {
    const kip = (extra: Partial<PriceRow>) => auto('ah', 'knakworst', 'AH Kip knakworst', 1.55, { size: '400 g', mechanic: '2e halve prijs', ...extra });
    const now = candidatesFor(wait, [cheap(), kip(running)], stores, today);
    expect(new Set(dealsFor(wait, now).map((c) => c.title))).toEqual(new Set(['AH Kip knakworst']));
    expect(skippedOffer(wait, now)).toBeUndefined();
    const soon = candidatesFor(wait, [cheap(), kip(nextWeek)], stores, today);
    expect(dealsFor(wait, soon)).toHaveLength(0);
    expect(upcomingFor(wait, soon)?.title).toBe('AH Kip knakworst');
  });
  it('actie op het product dat je nu al zou kopen telt altijd', () => {
    const cs = candidatesFor(wait, [unox(running), cheap()], stores, today); // Unox staat nu voorop
    expect(dealsFor(wait, cs).length).toBeGreaterThan(0);
  });
  it('eigen merk gekozen: dan telt elke actie op dat merk', () => {
    const fan = { ...wait, pinned: { ah: { product_id: 'Unox Knaks', title: '' } } };
    const cs = candidatesFor(fan, [cheap(), unox(running)], stores, today);
    expect(dealsFor(fan, cs).length).toBeGreaterThan(0);
    expect(skippedOffer(fan, cs)).toBeUndefined();
  });
  it('vergelijkt per stuk bij verschillende verpakkingen (luiers)', () => {
    const luiers = item('Luiers', { wait_offer: true });
    const klein = (price: number) => auto('ah', 'luiers', 'AH Luiers', price, { size: '30 stuks' });
    const pampers = () => auto('ah', 'luiers', 'Pampers Baby-dry luiers', 28.89, { base_price: 57.79, size: '112 stuks', mechanic: '50% korting', ...running });
    // Actie: € 0,26 per luier. Huismerk € 7,65 per 30 = € 0,26 per luier → even duur, dus een goede aanbieding
    expect(dealsFor(luiers, candidatesFor(luiers, [klein(7.65), pampers()], stores, today)).length).toBeGreaterThan(0);
    // Kost het huismerk maar € 0,17 per luier, dan is de actie geen voordeel
    const cs = candidatesFor(luiers, [klein(4.99), pampers()], stores, today);
    expect(dealsFor(luiers, cs)).toHaveLength(0);
    expect(skippedOffer(luiers, cs)).toMatchObject({ per: 'st' });
  });
  it('richtprijs blijft gewoon werken', () => {
    const target = { ...wait, target_price: 1.5 };
    const cs = candidatesFor(target, [cheap(), unox()], stores, today);
    expect(dealsFor(target, cs).map((c) => c.title)).toContain('AH Varkens knakworst');
    expect(skippedOffer(target, cs)).toBeUndefined();
  });
});
