// Past een product bij wat er op de lijst staat? ("bananen" ↔ "Jumbo Dole Bananen 5 Stuks")
import { normalizeQuery } from './text.js';

/** Dubbele letters samenvoegen ("banaan" → "banan"), zodat enkelvoud en meervoud elkaar vinden. */
export const collapse = (s: string) => s.replace(/(.)\1+/g, '$1');

/**
 * Eenvoudige Nederlandse woordstam:
 *  bananen/banaan → banan · eieren → ei · peren/peer → per · wortels → wortel · druiven → druif
 * "kaas", "vlees" en "saus" blijven heel (de -s hoort daar bij het woord).
 */
export function stem(w: string): string {
  let s = w;
  if (/eren$/.test(w) && w.length - 4 >= 2) s = w.slice(0, -4);
  else if (/en$/.test(w) && w.length - 2 >= 2) s = w.slice(0, -2).replace(/v$/, 'f').replace(/z$/, 's');
  else if (/(el|er|em|en|je|ie)s$/.test(w)) s = w.slice(0, -1);
  return collapse(s);
}

export const wordsOf = (s: string) => normalizeQuery(s).split(' ').filter((w) => w.length > 1);

// Wat mensen op een lijstje schrijven → hoe winkels het noemen.
const SYNONYMS: [RegExp, string][] = [
  [/\b(wc|toilet|plee)\s*(papier|rollen|rol)\b/g, 'toiletpapier'],
  [/\bafwas\s*tabletten\b|\bvaatwas\s*tabs?\b/g, 'vaatwastabletten'],
  [/\bkeuken\s*papier\b/g, 'keukenrol'],
];

/** Zoekterm zoals de winkel het noemt ("wc papier" → "toiletpapier"). */
export function storeTerm(query: string): string {
  let s = normalizeQuery(query);
  for (const [re, to] of SYNONYMS) s = s.replace(re, to);
  return s;
}

/**
 * 0 = de titel bevat alle woorden (ook als enkelvoud/meervoud)
 * 1 = de winkel deelt het product in bij deze zoekterm (categorie)
 * 2 = deels: het woord zit ín een ander woord ("melk" in "kokosmelk")
 * 3 = twijfelachtig: de winkel gaf het terug, maar de naam past niet
 */
export type MatchLevel = 0 | 1 | 2 | 3;

export function matchLevel(query: string, title: string, category = '', inStoreCategory = false): MatchLevel {
  const q = wordsOf(storeTerm(query)).map(stem);
  if (!q.length) return 3;
  const t = wordsOf(title).map(stem);
  if (q.every((w) => t.includes(w))) return 0;
  const c = wordsOf(category).map(stem);
  if (inStoreCategory || q.every((w) => t.includes(w) || c.includes(w))) return 1;
  const flat = collapse(wordsOf(`${title} ${category}`).join(' '));
  if (q.every((w) => w.length >= 3 && flat.includes(w))) return 2;
  return 3;
}

/**
 * Hoort een naam op een kassabon ("HALFV MELK 1L") bij een product op de lijst ("Halfvolle melk")?
 * Bonnen korten woorden af, dus een woord telt ook als de bon het begin ervan noemt.
 */
export function looselyMatches(itemName: string, otherName: string): boolean {
  const a = wordsOf(itemName).map(stem);
  const b = wordsOf(otherName).map(stem);
  if (!a.length || !b.length) return false;
  // Alleen de bon kort af: "halfv" hoort bij "halfvolle", maar "brood" niet bij "broodjes".
  const same = (word: string, other: string) => word === other || (other.length >= 4 && word.startsWith(other));
  return a.every((w) => b.some((o) => same(w, o)));
}
