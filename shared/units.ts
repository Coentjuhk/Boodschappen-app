// Inhoud van een verpakking lezen ("400 g", "6 x 200 ml", "4 + 2 stuks"), zodat prijzen eerlijk
// vergeleken kunnen worden: per kilo, per liter of per stuk.

export interface Amount {
  value: number;
  unit: 'kg' | 'l' | 'st';
}

const UNITS: Record<string, [Amount['unit'], number]> = {
  kg: ['kg', 1], kilo: ['kg', 1], g: ['kg', 0.001], gr: ['kg', 0.001], gram: ['kg', 0.001],
  l: ['l', 1], liter: ['l', 1], ltr: ['l', 1], ml: ['l', 0.001], cl: ['l', 0.01], dl: ['l', 0.1],
  stuks: ['st', 1], stuk: ['st', 1], st: ['st', 1], rollen: ['st', 1], tabletten: ['st', 1], tabs: ['st', 1],
  wasbeurten: ['st', 1], zakjes: ['st', 1], capsules: ['st', 1], doekjes: ['st', 1], plakken: ['st', 1], luiers: ['st', 1], wassen: ['st', 1],
};
const U = Object.keys(UNITS).sort((a, b) => b.length - a.length).join('|');
const N = '(\\d+(?:\\.\\d+)?)';
const TIMES = new RegExp(`${N}\\s*x\\s*${N}\\s*(${U})\\b`);   // "6 x 200 ml"
const PLUS = new RegExp(`${N}\\s*\\+\\s*${N}\\s*(${U})\\b`);  // "4 + 2 stuks"
const SINGLE = new RegExp(`${N}\\s*(${U})\\b`);               // "400 g", "1,5 l", "10 stuks"

function make(value: number, unit: string): Amount | null {
  const [u, factor] = UNITS[unit];
  const v = value * factor;
  return v > 0 && Number.isFinite(v) ? { value: v, unit: u } : null;
}

function read(text: string | null | undefined, last = false): Amount | null {
  if (!text) return null;
  const s = text.toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
  let m = s.match(TIMES);
  if (m) return make(+m[1] * +m[2], m[3]);
  m = s.match(PLUS);
  if (m) return make(+m[1] + +m[2], m[3]);
  // In een titel staat de inhoud meestal achteraan ("Luiers maat 5 11-16 kg 31 stuks" → 31 stuks).
  const all = [...s.matchAll(new RegExp(SINGLE, 'g'))];
  m = last ? all[all.length - 1] : all[0];
  if (m) return make(+m[1], m[2]);
  return /per stuk/.test(s) ? { value: 1, unit: 'st' } : null;
}

/** Inhoud van een product: eerst uit de maat ("400 g"), anders uit de titel. */
export function parseAmount(size: string | null | undefined, title?: string | null): Amount | null {
  return read(size) ?? read(title, true);
}
