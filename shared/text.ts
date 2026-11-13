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
  plak: 'plak', plakken: 'plak', plakje: 'plak', plakjes: 'plak',
  eetlepels: 'el', theelepels: 'tl', teentje: 'teen', teentjes: 'teen',
  takje: 'takje', takjes: 'takje', snufje: 'snufje', scheutje: 'scheutje',
  handje: 'handje', handvol: 'handje', bosjes: 'bos', blokje: 'blokje', blokjes: 'blokje',
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

// ---------- Recepttekst (geplakt of van een foto) ----------

const START = /^\s*(ingredi[eë]nten|benodigdheden|wat heb je nodig|je hebt nodig|boodschappen)\b/i;
const STOP = /^\s*(bereiding|bereidingswijze|werkwijze|instructies|zo maak je het|aan de slag|methode|stap 1|tip[s:]?\b|voedingswaarde)/i;
const PANTRY = ['zout', 'peper', 'olie', 'olijfolie', 'zonnebloemolie', 'water', 'suiker', 'bloem', 'peper en zout', 'zout en peper'];

export function looksLikeRecipe(text: string): boolean {
  return text.split(/\r?\n/).some((l) => START.test(l));
}

/** Aantal personen uit de tekst halen ("Voor 4 personen", "4 pers.", "Porties: 6"). */
export function detectServings(text: string): number | null {
  const m = text.match(/(?:voor\s+)?(\d{1,2})\s*(?:personen|pers\b|porties|persoon)|porties?:?\s*(\d{1,2})/i);
  const n = m ? Number(m[1] ?? m[2]) : NaN;
  return n > 0 && n < 30 ? n : null;
}

export interface Ingredient extends ParsedLine { pantry: boolean }

/** Alleen de ingrediënten uit een recepttekst halen. */
export function extractIngredients(text: string): Ingredient[] {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/[|_~*•·]+/g, ' ').replace(/\s+/g, ' ').trim());
  let body = lines;
  const start = lines.findIndex((l) => START.test(l));
  if (start >= 0) {
    const rest = lines.slice(start + 1);
    const stop = rest.findIndex((l) => STOP.test(l));
    body = stop >= 0 ? rest.slice(0, stop) : rest;
  } else {
    // Geen kopje gevonden: houd regels die op een ingrediënt lijken
    body = lines.filter((l) => /^(\d|½|¼|een\s|snufje|scheutje|handje)/i.test(l) && l.split(' ').length <= 8 && !/\.$/.test(l));
  }
  const out: Ingredient[] = [];
  for (const raw of body) {
    if ((raw.match(/[a-zà-ÿ]/gi) ?? []).length < 2) continue;      // ruis
    if (raw.split(' ').length > 12 || /\.\s+\S/.test(raw)) continue; // zinnen = bereiding
    if (/^voor\s+\d|personen|^porties/i.test(raw)) continue;
    let line = raw.replace(/^(ca\.?|circa|\+-|±)\s*/i, '').replace(/^een\s+/i, '1 ').replace(/^(snufje|scheutje|handje|takje)\s/i, '1 $1 ');
    line = line.replace(/\s*(naar smaak|om te bakken|om in te bakken|voor erbij)\s*$/i, '');
    const p = parseLine(line);
    if (!p) continue;
    // "ui, gesnipperd" → "Ui"
    const [name, ...prep] = p.name.split(',');
    const clean = name.replace(/\s+(gesnipperd|fijngehakt|in blokjes|in plakjes|geraspt|uitgeperst)$/i, '').trim();
    if (!clean) continue;
    const pantry = PANTRY.includes(clean.toLowerCase()) || /^(snufje|scheutje)$/.test(p.unit ?? '');
    const unit = p.unit && ['snufje', 'scheutje', 'takje', 'handje', 'el', 'tl'].includes(p.unit) ? undefined : p.unit;
    out.push({ ...p, name: clean.charAt(0).toUpperCase() + clean.slice(1), quantity: unit ? p.quantity : p.unit ? 1 : Math.max(1, Math.ceil(p.quantity)), unit, note: p.note ?? (prep.join(',').trim() || undefined), pantry });
  }
  // Dubbele samenvoegen
  const merged = new Map<string, Ingredient>();
  for (const i of out) {
    const k = normalizeQuery(i.name) + '|' + (i.unit ?? '');
    const cur = merged.get(k);
    if (cur) cur.quantity += i.quantity; else merged.set(k, { ...i });
  }
  return [...merged.values()];
}
