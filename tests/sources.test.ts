import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { jumboPeriod, parseAH, parseJumboHtml } from '../api/_lib/sources';

const ah = JSON.parse(readFileSync(new URL('./fixtures/ah.json', import.meta.url), 'utf8'));
const jumbo = JSON.parse(readFileSync(new URL('./fixtures/jumbo.json', import.meta.url), 'utf8'));
const now = new Date('2026-11-13T12:00:00Z');

describe('Albert Heijn (echte voorbeelddata)', () => {
  it('laat online-bundels, Etos en gesponsorde producten niet voorgaan', () => {
    for (const q of Object.keys(ah)) {
      const r = parseAH(ah[q], q);
      expect(r.length, q).toBeGreaterThan(0);
      expect(r.some((p) => /-pack$|-pk$/i.test(p.title) && /volume/i.test(p.mechanic ?? '')), q).toBe(false);
      expect(r.some((p) => /volume voordeel/i.test(p.mechanic ?? '')), q).toBe(false);
      expect(r.some((p) => /^Etos /.test(p.title)), q).toBe(false);
    }
  });
  it('kiest een logisch eerste product', () => {
    const first = (q: string) => parseAH(ah[q], q)[0];
    expect(first('halfvolle melk')).toMatchObject({ title: 'AH Halfvolle melk', size: '1 l', price: 1.29, match: 0 });
    expect(first('knakworsten').title).toBe('AH Kip knakworst');
    expect(first('pasta').title).toMatch(/pasta/i);
    expect(first('melk').title).toMatch(/\bmelk$/i);
    expect(first('scheermesjes').match).toBe(0);
  });
  it('herkent categorie van de winkel als match', () => {
    const r = parseAH(ah.pasta, 'pasta');
    expect(r.every((p) => (p.match ?? 3) <= 1)).toBe(true); // alleen echte pasta, geen diepvriesmaaltijd
    expect(r.some((p) => p.match === 1)).toBe(true);
  });
  it('leest acties met begin- en einddatum', () => {
    const knaks = parseAH(ah.knakworsten, 'knakworsten').find((p) => p.title === 'Unox Knaks');
    expect(knaks).toMatchObject({ mechanic: '2 voor 4.99', base_price: 2.89, offer_until: '2026-11-22' });
    expect(knaks!.offer_from! > '2026-11-13').toBe(true); // "vanaf maandag": nog niet ingegaan
    const fixed = parseAH(ah.kaas, 'roomkaas philadelphia').find((p) => /Philadelphia/.test(p.title));
    if (fixed) expect(fixed).toMatchObject({ price: 1.99, base_price: 2.99 });
  });
});

describe('Jumbo (echte voorbeelddata)', () => {
  it('leest producten, maat en prijs', () => {
    const r = parseJumboHtml(jumbo.pasta, 'pasta', now);
    expect(r.length).toBeGreaterThan(2);
    expect(r.every((p) => p.price > 0 && p.product_id && p.title)).toBe(true);
    expect(r[0].title).toMatch(/pasta/i);       // titel-match gaat voor
    expect(r[0].title).not.toMatch(/saus/i);
    expect(r.some((p) => /gesponsord/i.test(p.size ?? ''))).toBe(false);
  });
  it('ziet bezorgkorting niet als aanbieding, een echte actie wel', () => {
    const r = parseJumboHtml(jumbo.pasta, 'tagliatelle rigatoni penne fusilli', now); // niets past → alles "twijfel"
    const all = parseJumboHtml(jumbo.pasta.replace(/Gesponsord/g, ''), 'jumbo', now);
    expect([...r, ...all].some((p) => /bij elke|bezorg/i.test(p.mechanic ?? ''))).toBe(false);
    const tag = parseJumboHtml(jumbo.pasta, 'tagliatelle', now).find((p) => /Tagliatelle/.test(p.title));
    expect(tag).toMatchObject({ mechanic: '2 voor 3,99', offer_from: '2026-11-11', offer_until: '2026-11-17' });
  });
  it('zet het echte product voorop bij slechte zoekresultaten', () => {
    const r = parseJumboHtml(jumbo.kattenvoer, 'kattenvoer', now);
    expect(r.every((p) => !/vlo|kattenbak|speelgoed/i.test(p.title) || p.match === 3)).toBe(true);
    const b = parseJumboHtml(jumbo.bananen, 'bananen', now);
    expect(b[0].title).toBe('Jumbo Dole Bananen 5 Stuks');
    const m = parseJumboHtml(jumbo['halfvolle melk'], 'halfvolle melk', now);
    expect(m[0].title).toBe('Jumbo Verse Halfvolle Melk 1 L'); // niet gesponsord, geen 6-pack
  });
  it('leest periodes', () => {
    expect(jumboPeriod('wo 11 t/m di 17 nov', now)).toEqual({ from: '2026-11-11', until: '2026-11-17' });
    expect(jumboPeriod('wo 28 t/m di 3 dec', new Date('2026-11-29'))).toEqual({ from: '2026-11-28', until: '2026-12-03' });
    expect(jumboPeriod('t/m 3 jan', new Date('2026-12-20'))).toEqual({ from: null, until: '2027-01-03' });
    expect(jumboPeriod('30 dec t/m 5 jan', new Date('2026-12-31'))).toEqual({ from: '2026-12-30', until: '2027-01-05' });
  });
});
