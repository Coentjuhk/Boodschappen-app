import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { jumboUntil, parseJumboHtml } from '../api/_lib/sources';

describe('jumbo', () => {
  it('leest einddatum van actie', () => {
    expect(jumboUntil('wo 11 t/m di 17 nov', new Date('2026-11-13'))).toBe('2026-11-17');
    expect(jumboUntil('t/m 3 jan', new Date('2026-12-20'))).toBe('2027-01-03');
  });
  const f = process.env.JUMBO_HTML;
  it.skipIf(!f || !existsSync(f))('leest productkaarten uit een echte zoekpagina', () => {
    const r = parseJumboHtml(readFileSync(f!, 'utf8'));
    console.log(r.slice(0, 5));
    expect(r.length).toBeGreaterThan(3);
    expect(r[0].price).toBeGreaterThan(0);
  });
});
