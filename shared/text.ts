// Tekst-hulpjes die zowel de app als de server gebruiken.

/** Zoekterm normaliseren zodat "Halfvolle Melk " en "halfvolle melk" dezelfde prijzen delen. */
export function normalizeQuery(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ParsedLine {
  name: string;
  quantity: number;
  unit?: string;
  note?: string;
}

const UNITS: Record<string, string> = {
  g: 'g', gr: 'g', gram: 'g',
  kg: 'kg', kilo: 'kg',
  ml: 'ml', cl: 'cl', l: 'l', liter: 'l',
  st: 'st', stuk: 'st', stuks: 'st',
  pak: 'pak', pakken: 'pak', pakje: 'pak', pakjes: 'pak',
  zak: 'zak', zakken: 'zak', zakje: 'zak',
  blik: 'blik', blikken: 'blik', blikje: 'blik',
  fles: 'fles', flessen: 'fles',
  doos: 'doos', dozen: 'doos',
  bos: 'bos', bosje: 'bos',
  el: 'el', tl: 'tl', eetlepel: 'el', theelepel: 'tl',
  teen: 'teen', tenen: 'teen',
  plak: 'plak', plakken: 'plak',
};

function num(s: string): number {
  if (s === '½') return 0.5;
  if (s === '¼') return 0.25;
  if (s.includes('/')) {
    const [a, b] = s.split('/').map(Number);
    return b ? a / b : 1;
  }
  return Number(s.replace(',', '.'));
}

/**
 * Eén regel van een geplakte lijst begrijpen:
 *  "2x melk", "melk x2", "melk 2", "500 g gehakt", "3 blikken tomaten", "- brood (volkoren)"
 */
export function parseLine(raw: string): ParsedLine | null {
  let s = raw
    .replace(/^\s*([-*•▢☐□✓✔]|\[[ xX]?\]|\d+[.)])\s+/, '') // opsommingstekens / nummering
    .trim();
  if (!s) return null;

  let note: string | undefined;
  const paren = s.match(/\(([^)]*)\)\s*$/);
  if (paren) {
    note = paren[1].trim() || undefined;
    s = s.slice(0, paren.index).trim();
  }

  const n = '(\\d+(?:[.,]\\d+)?|\\d+/\\d+|½|¼)';
  const unitAlt = Object.keys(UNITS).sort((a, b) => b.length - a.length).join('|');

  // "500 g gehakt", "3 blikken tomaten", "2x melk", "2 melk"
  let m = s.match(new RegExp(`^${n}\\s*(?:x\\s*)?(?:(${unitAlt})\\.?\\s+)?(.+)$`, 'i'));
  if (m) {
    const unit = m[2] ? UNITS[m[2].toLowerCase()] : undefined;
    return { name: tidy(m[3]), quantity: num(m[1]), unit, note };
  }
  // "melk x2", "melk 2x", "melk 2", "gehakt 500g"
  m = s.match(new RegExp(`^(.+?)\\s+(?:x\\s*)?${n}\\s*(?:x|(${unitAlt}))?\\.?$`, 'i'));
  if (m) {
    const unit = m[3] ? UNITS[m[3].toLowerCase()] : undefined;
    return { name: tidy(m[1]), quantity: num(m[2]), unit, note };
  }
  return { name: tidy(s), quantity: 1, note };
}

function tidy(s: string) {
  const t = s.replace(/[,;:]+$/, '').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Een hele geplakte tekst (WhatsApp, Notities, Listonic-export) omzetten. Komma's tellen ook als scheiding. */
export function parseList(text: string): ParsedLine[] {
  const lines = text.split(/\r?\n/);
  const parts = lines.length === 1 ? text.split(/[,;]/) : lines;
  return parts.map(parseLine).filter((x): x is ParsedLine => !!x && x.name.length > 0);
}

export function euro(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '–';
  return '€ ' + n.toFixed(2).replace('.', ',');
}
