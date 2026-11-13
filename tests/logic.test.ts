import { describe, expect, it } from 'vitest';
import { parseLine, parseList, normalizeQuery, extractIngredients, detectServings, looksLikeRecipe } from '../shared/text';
import { offerTotal, evaluateOffer } from '../shared/offers';
import { guessCategory } from '../shared/catalog';
import { plan, type Candidate, type OptStore } from '../shared/optimizer';
import { stem } from '../src/lib/candidates';

describe('lijst plakken', () => {
  it('begrijpt hoeveelheden', () => {
    expect(parseLine('2x melk')).toMatchObject({ name: 'Melk', quantity: 2 });
    expect(parseLine('melk x3')).toMatchObject({ name: 'Melk', quantity: 3 });
    expect(parseLine('500 g gehakt')).toMatchObject({ name: 'Gehakt', quantity: 500, unit: 'g' });
    expect(parseLine('3 blikken tomaten')).toMatchObject({ name: 'Tomaten', quantity: 3, unit: 'blik' });
    expect(parseLine('- brood (volkoren)')).toMatchObject({ name: 'Brood', quantity: 1, note: 'volkoren' });
    expect(parseLine('☐ kattenvoer')).toMatchObject({ name: 'Kattenvoer', quantity: 1 });
  });
  it('splitst regels en komma’s', () => {
    expect(parseList('melk\nbrood\n\n2 kaas').map((l) => l.name)).toEqual(['Melk', 'Brood', 'Kaas']);
    expect(parseList('melk, brood, eieren')).toHaveLength(3);
  });
  it('normaliseert zoektermen', () => {
    expect(normalizeQuery('  Crème Fraîche! ')).toBe('creme fraiche');
  });
});

describe('aanbiedingen', () => {
  const p = (mechanic: string) => ({ price: 2, base_price: 2, mechanic });
  it('1+1 gratis', () => {
    expect(offerTotal(p('1+1 gratis'), 1)).toBe(2);
    expect(offerTotal(p('1+1 gratis'), 2)).toBe(2);
    expect(offerTotal(p('1+1 gratis'), 3)).toBe(4);
  });
  it('2e halve prijs', () => expect(offerTotal(p('2e halve prijs'), 2)).toBe(3));
  it('N voor P', () => expect(offerTotal(p('3 voor 5,00'), 4)).toBe(7));
  it('% korting', () => expect(offerTotal(p('25% korting'), 2)).toBe(3));
  it('geeft bundeltip', () => {
    expect(evaluateOffer(p('1+1 gratis'), 1).bundleTip?.text).toMatch(/Neem er 2: zelfde prijs/);
    expect(evaluateOffer({ price: 2 }, 1).bundleTip).toBeUndefined();
  });
});

describe('categorie raden', () => {
  it('kiest logische soort', () => {
    expect(guessCategory('Kattenvoer')).toBe('huisdier');
    expect(guessCategory('Schroeven 4x40')).toBe('klussen');
    expect(guessCategory('Halfvolle melk')).toBe('zuivel');
    expect(guessCategory('Verjaardagskaart')).toBe('kantoor');
    expect(guessCategory('Shampoo')).toBe('verzorging');
  });
});

describe('optimizer', () => {
  const stores: OptStore[] = [
    { id: 'ah', name: 'AH', chain: 'ah', kinds: ['supermarkt'], online: false, delivery_fee: 0, min_order: 0 },
    { id: 'jumbo', name: 'Jumbo', chain: 'jumbo', kinds: ['supermarkt'], online: false, delivery_fee: 0, min_order: 0 },
    { id: 'slager', name: 'Slager', kinds: ['slager'], online: false, delivery_fee: 0, min_order: 0 },
  ];
  const items = [
    { id: 'melk', name: 'melk', quantity: 1, category: 'zuivel' },
    { id: 'kaas', name: 'kaas', quantity: 1, category: 'zuivel' },
    { id: 'gehakt', name: 'gehakt', quantity: 1, category: 'vlees' },
  ];
  const c = (store_id: string, price: number, extra: Partial<Candidate> = {}): Candidate => ({ store_id, product_id: store_id + price, title: 'x', price, ...extra });
  const cands = {
    melk: [c('ah', 1.2), c('jumbo', 1.1)],
    kaas: [c('ah', 5), c('jumbo', 4)],
    gehakt: [],
  };

  it('goedkoopst zonder strafje: per product de laagste prijs', () => {
    const r = plan(items, cands, stores, { mode: 'cheapest', storeIds: [], extraStorePenalty: 0 });
    expect(r.assignments.melk.store_id).toBe('jumbo');
    expect(r.assignments.kaas.store_id).toBe('jumbo');
    expect(r.total).toBe(5.1);
  });
  it('één winkel', () => {
    const r = plan(items, cands, stores, { mode: 'single', storeIds: ['ah'], extraStorePenalty: 0 });
    expect(r.assignments.melk.store_id).toBe('ah');
    expect(r.total).toBe(6.2);
    expect(r.assignments.gehakt.store_id).toBe('ah'); // geen prijs: blijft in de enige winkel
  });
  it('extra winkel alleen als het genoeg scheelt', () => {
    const c2 = { melk: [c('ah', 1.0), c('jumbo', 1.1)], kaas: [c('ah', 5), c('jumbo', 4)], gehakt: [] };
    const cheap = plan(items, c2, stores, { mode: 'cheapest', storeIds: [], extraStorePenalty: 0 });
    expect(cheap.stores.sort()).toEqual(['ah', 'jumbo']);
    const lazy = plan(items, c2, stores, { mode: 'cheapest', storeIds: [], extraStorePenalty: 2 });
    expect(lazy.stores).toEqual(['jumbo']);
  });
  it('rekent bezorgkosten mee', () => {
    const online: OptStore[] = [...stores, { id: 'web', name: 'Online', chain: 'jumbo', kinds: ['supermarkt'], online: true, delivery_fee: 5, min_order: 0 }];
    const c3 = { ...cands, melk: [...cands.melk, c('web', 0.5)], kaas: [...cands.kaas, c('web', 3.5)] };
    const r = plan(items, c3, online, { mode: 'cheapest', storeIds: [], extraStorePenalty: 0 });
    expect(r.stores).not.toContain('web'); // 1,10 besparing < 5 euro bezorgen
  });
  it('500 g gehakt telt als één portie', () => {
    const r = plan([{ id: 'g', name: 'gehakt', quantity: 500, unit: 'g', category: 'vlees' }], { g: [c('slager', 3.5)] }, stores, { mode: 'cheapest', storeIds: [], extraStorePenalty: 0 });
    expect(r.total).toBe(3.5);
  });
  it('vastgezette winkel wint', () => {
    const r = plan([{ ...items[0], store_id: 'ah' }], cands, stores, { mode: 'cheapest', storeIds: [], extraStorePenalty: 0 });
    expect(r.assignments.melk.store_id).toBe('ah');
  });
});

describe('recepttekst', () => {
  const recipe = `Lasagne
Voor 4 personen
Ingrediënten
500 g rundergehakt
1 ui, gesnipperd
2 teentjes knoflook
1 blik tomatenblokjes
12 lasagnebladen
200 g geraspte kaas
snufje zout
2 eetlepels olijfolie
Bereiding
Verwarm de oven voor op 200 graden. Bak het gehakt rul.`;
  it('herkent een recept', () => expect(looksLikeRecipe(recipe)).toBe(true));
  it('vindt het aantal personen', () => expect(detectServings(recipe)).toBe(4));
  it('haalt alleen ingrediënten eruit', () => {
    const r = extractIngredients(recipe);
    expect(r.map((x) => x.name)).toEqual(['Rundergehakt', 'Ui', 'Knoflook', 'Tomatenblokjes', 'Lasagnebladen', 'Geraspte kaas', 'Zout', 'Olijfolie']);
    expect(r.find((x) => x.name === 'Rundergehakt')).toMatchObject({ quantity: 500, unit: 'g' });
    expect(r.find((x) => x.name === 'Knoflook')).toMatchObject({ quantity: 2, unit: 'teen' });
    expect(r.find((x) => x.name === 'Zout')?.pantry).toBe(true);
    expect(r.find((x) => x.name === 'Olijfolie')).toMatchObject({ pantry: true, quantity: 1, unit: undefined });
  });
});

describe('woordstam', () => {
  it('vindt enkelvoud bij meervoud', () => {
    expect('ah banan'.includes(stem('bananen'))).toBe(true);
    expect(stem('kaas')).toBe('kas');
    expect('kattenvoer'.replace(/(.)\1+/g, '$1').includes(stem('kaas'))).toBe(false);
    expect(stem('eieren')).toBe('eieren'); // te kort om te strippen; titels bevatten meestal 'eieren'
  });
});
