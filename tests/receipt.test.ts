import { describe, expect, it } from 'vitest';
import { checkReceipt, mergeReceipts, netUnitPrice, parseReceipt, receiptSum } from '../shared/receipt';

describe('kassabon (eenvoudig)', () => {
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

  it('herkent Lidl en de producten', () => {
    const r = parseReceipt(lidl);
    expect(r.chain).toBe('lidl');
    expect(r.total).toBe(9.25);
    expect(r.lines.map((l) => l.name)).toEqual(['Halfvolle melk', 'Boerenbruin', 'Knakworsten', 'Kipfilet']);
    const k = r.lines[2];
    expect(k).toMatchObject({ quantity: 2, price: 1.29, total: 2.58, discount: 0.4 });
    expect(netUnitPrice(k)).toBe(1.09);
    expect(receiptSum(r.lines)).toBe(8.85);
  });
  it('aantal op dezelfde regel, ook met leesfoutjes', () => {
    const ocr = parseReceipt('LIDL\nKNAKWORSTEN 2,58 B\n2 Xx 1,29\nLidl Plus korting -0,40');
    expect(ocr.lines[0]).toMatchObject({ quantity: 2, price: 1.29, discount: 0.4 });
    const r = parseReceipt('ALBERT HEIJN\nAH PINDAKAAS 2 x 2,49 4,98\nTOTAAL 4,98');
    expect(r.chain).toBe('ah');
    expect(r.lines[0]).toMatchObject({ name: 'Ah pindakaas', quantity: 2, price: 2.49, total: 4.98 });
  });
  it('herstelt een btw-letter die aan de prijs plakt en een dubbele punt als komma', () => {
    const r = parseReceipt('OMSCHRIJVING EUR\nTriangel 1,178B\nSnoeptomaten rood 2,758\nCrème fraîche 0.958\nPeren los 1:96 B\nWraps 8x20cm 0,92 B\nVuilniszak 71x110 1,69 C\nTotaal 9,44');
    expect(r.lines.map((l) => [l.name, l.price])).toEqual([['Triangel', 1.17], ['Snoeptomaten rood', 2.75], ['Crème fraîche', 0.95], ['Peren los', 1.96], ['Wraps 8x20cm', 0.92], ['Vuilniszak 71x110', 1.69]]);
    expect(receiptSum(r.lines)).toBe(9.44);
  });
  it('gewogen product: bewaart de kiloprijs', () => {
    const r = parseReceipt('OMSCHRIJVING EUR\nBananen 1,27 B\n1,100 kg x 1,15 EUR/kg\nMelk 0,95 B\nTotaal 2,22');
    expect(r.lines[0]).toMatchObject({ name: 'Bananen', perKg: true, price: 1.15, total: 1.27, quantity: 1 });
    expect(receiptSum(r.lines)).toBe(2.22);
  });
  it('korting zonder minteken telt ook als korting', () => {
    const r = parseReceipt('OMSCHRIJVING EUR\nChampignons 1,05 B\nIn prijs verlaagd 0,03\nSpitskool 1,69 B\nLidl Plus kassabon -0,06\nActieprijs -0,19\nTotaal 2,46');
    expect(r.lines.map((l) => l.name)).toEqual(['Champignons', 'Spitskool']);
    expect(r.lines[0].discount).toBe(0.03);
    expect(r.lines[1].discount).toBe(0.25);
    expect(receiptSum(r.lines)).toBe(2.46);
  });
  it('aantal × prijs moet het regelbedrag zijn', () => {
    // stukprijs verkeerd gelezen (0,57 i.p.v. 0,67): het regelbedrag klopt wel
    expect(parseReceipt('Komkommer 3 xXx 0,57 2,018').lines[0]).toMatchObject({ quantity: 3, price: 0.67, total: 2.01, unsure: true });
    // regelbedrag verkeerd gelezen (14,23 i.p.v. 14,28): de stukprijs klopt wel
    expect(parseReceipt('Magere Franse kwark 12 x 1,19 14,23 B').lines[0]).toMatchObject({ quantity: 12, price: 1.19, total: 14.28, unsure: true });
  });
  it('aantal of stukprijs slecht leesbaar: rekent het uit met het regelbedrag', () => {
    const r = parseReceipt('OMSCHRIJVING EUR\nKomkommer 2x 0,657 1.34\nKipfilet gerookt á« 2,49 9,96 B\nBio amandeldrink 2 « 1,48 2,96\nBlue Band zZz x 1,99 3,98 B\nVuilniszak 71x110 1,69 C\nTotaal 19,93');
    expect(r.lines.map((l) => [l.name, l.quantity, l.price, l.total])).toEqual([
      ['Komkommer', 2, 0.67, 1.34], ['Kipfilet gerookt', 4, 2.49, 9.96], ['Bio amandeldrink', 2, 1.48, 2.96], ['Blue band', 2, 1.99, 3.98], ['Vuilniszak 71x110', 1, 1.69, 1.69],
    ]);
  });
  it('gewogen product: herstelt een verkeerd gelezen kiloprijs met gewicht × prijs = regelbedrag', () => {
    const r = parseReceipt('OMSCHRIJVING EUR\nAardappel zoet 4,00 B\n1,440 kg x 2,73 EUR/kg\nGember 0,23 B\n0,038 kg x 5,98 EUR/kg\nTotaal 4,23');
    expect(r.lines[0]).toMatchObject({ perKg: true, price: 2.78, total: 4 });   // 2,73 → 2,78 (één cijfer verkeerd gelezen)
    expect(r.lines[0].unsure).toBeUndefined();
    expect(r.lines[1]).toMatchObject({ perKg: true, price: 5.98, total: 0.23 });
  });
  it('leest de totale besparing en controleert de regelbedragen daarmee', () => {
    const text = 'OMSCHRIJVING EUR\nKookroom 0,98 B\nLidl Plus korting -0,98\nPrei 0,55 B\nLidl Plus korting -0,16\nMelk 0,95 B\nAantal 3 art.\nTotaal 1,34\nBankpas 1,34\nJouw totale besparing is\n1,14 EUR\nWaarvan je met Lidl Plus\n1,14 EUR hebt bespaard';
    const r = parseReceipt(text);
    expect(r).toMatchObject({ total: 1.34, savings: 1.14 });
    expect(checkReceipt(r)).toEqual({ expected: 2.48, got: 2.48, ok: true });
    // een kortingsregel verkeerd gelezen maakt voor deze controle niet uit, een regelbedrag wel
    expect(checkReceipt(parseReceipt(text.replace('-0,16', '-0,76')))!.ok).toBe(true);
    expect(checkReceipt(parseReceipt(text.replace('0,98 B', '0,93 B')))!.ok).toBe(false);
  });
  it('twee lezingen: neemt per regel de lezing waarmee de bon klopt', () => {
    const good = ['Kookroom 0,98 B', 'Rucola sla 0,98 B', 'Melk 0,95 B', 'Bananen 1,27 B', 'Kaas 2,18 B'];
    const foot = 'Aantal 5 art.\nTotaal 6,36\nJouw totale besparing is\n0,00 EUR';
    const reading = (changes: Record<string, string>) => parseReceipt('OMSCHRIJVING EUR\n' + good.map((l) => changes[l] ?? l).join('\n') + '\n' + foot);
    const first = reading({ 'Kookroom 0,98 B': 'Kookroom 0,93 B' });                    // 8 gelezen als 3
    const second = reading({ 'Melk 0,95 B': 'Melk 0,35 B', 'Kaas 2,18 B': 'Kaas 2,13 B' }); // andere fouten
    expect(checkReceipt(first)!.ok).toBe(false);
    const merged = mergeReceipts(first, second);
    expect(checkReceipt(merged)!.ok).toBe(true);
    expect(merged.lines.map((l) => l.total)).toEqual([0.98, 0.98, 0.95, 1.27, 2.18]);
    expect(merged.lines.some((l) => l.unsure)).toBe(false);
  });
  it('twee lezingen die er samen niet uitkomen: hoofdlezing blijft, verschillen krijgen een waarschuwing', () => {
    const a = parseReceipt('OMSCHRIJVING EUR\nKookroom 0,93 B\nMelk 0,95 B\nTotaal 9,99');
    const b = parseReceipt('OMSCHRIJVING EUR\nKookroom 0,98 B\nMelk 0,95 B\nTotaal 9,99');
    const merged = mergeReceipts(a, b);
    expect(merged.lines[0]).toMatchObject({ total: 0.93, unsure: true, alt: 0.98 });
    expect(merged.lines[1].unsure).toBeUndefined();
  });
  it('stopt bij het totaal: betaalgegevens zijn geen producten', () => {
    const r = parseReceipt('OMSCHRIJVING EUR\nMelk 0,95 B\nAantal 1 art.\nTotaal 0,95\nBankpas 0,95\nKaartbetaling Totaal EUR 0,95\nB 9 0,87 0,08 0,95\nJouw totale besparing is 4,77 EUR');
    expect(r.lines).toHaveLength(1);
    expect(r.total).toBe(0.95);
  });
});
