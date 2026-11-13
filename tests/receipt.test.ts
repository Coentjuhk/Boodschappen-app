import { describe, expect, it } from 'vitest';
import { parseReceipt, netUnitPrice } from '../shared/receipt';

const lidl = `LIDL
Spijkenisse
EUR
Halfvolle melk 0,99 B
Boerenbruin 0,69 B
Knakworsten 2,58 B
2 x 1,29
Lidl Plus korting -0,40
Kipfilet 4,99 B
Te betalen 9,25
PIN 9,25
BTW 9% 0,76`;

describe('kassabon', () => {
  it('herkent Lidl en de producten', () => {
    const r = parseReceipt(lidl);
    expect(r.chain).toBe('lidl');
    expect(r.total).toBe(9.25);
    expect(r.lines.map((l) => l.name)).toEqual(['Halfvolle melk', 'Boerenbruin', 'Knakworsten', 'Kipfilet']);
    const k = r.lines[2];
    expect(k).toMatchObject({ quantity: 2, price: 1.29, discount: 0.4 });
    expect(netUnitPrice(k)).toBe(1.09);
  });
  it('aantal op dezelfde regel', () => {
    const ocr = parseReceipt('LIDL\nKNAKWORSTEN 2,58 B\n2 Xx 1,29\nLidl Plus korting -0,40');
    expect(ocr.lines[0]).toMatchObject({ quantity: 2, price: 1.29, discount: 0.4 });
    const r = parseReceipt('ALBERT HEIJN\nAH PINDAKAAS 2 x 2,49 4,98\nTOTAAL 4,98');
    expect(r.chain).toBe('ah');
    expect(r.lines[0]).toMatchObject({ name: 'Ah pindakaas', quantity: 2, price: 2.49 });
  });
});
