// Wijzigingen aan de lijst gaan eerst in een wachtrij op de telefoon en dan naar de server.
// Zo werkt afvinken en toevoegen ook met slecht bereik in de winkel: het wordt later vanzelf verstuurd.
import type { Item } from './types';

export type Op =
  | { t: 'insert'; row: Item }
  | { t: 'update'; id: string; patch: Partial<Item> }
  | { t: 'delete'; id: string };

/** De lijst zoals jij hem ziet: de stand van de server plus wat nog verstuurd moet worden. */
export function applyOps(items: Item[], ops: Op[]): Item[] {
  let list = items;
  for (const op of ops) {
    if (op.t === 'insert') {
      if (!list.some((i) => i.id === op.row.id)) list = [...list, op.row];
    } else if (op.t === 'update') {
      list = list.map((i) => (i.id === op.id ? { ...i, ...op.patch } : i));
    } else {
      list = list.filter((i) => i.id !== op.id);
    }
  }
  return list;
}

/** Nieuwe wijziging achteraan zetten. Opeenvolgende aanpassingen aan hetzelfde product worden samengevoegd. */
export function enqueue(queue: Op[], op: Op, headBusy: boolean): Op[] {
  const last = queue[queue.length - 1];
  const lastIsHead = queue.length === 1;
  if (op.t === 'update' && last?.t === 'update' && last.id === op.id && !(headBusy && lastIsHead)) {
    return [...queue.slice(0, -1), { ...last, patch: { ...last.patch, ...op.patch } }];
  }
  if (op.t === 'update' && last?.t === 'insert' && last.row.id === op.id && !(headBusy && lastIsHead)) {
    return [...queue.slice(0, -1), { ...last, row: { ...last.row, ...op.patch } }];
  }
  return [...queue, op];
}

/** Wat de server terugzegt over een verstuurde wijziging. */
export type SendResult = 'ok' | 'later' | { error: string };

/**
 * Mislukt door de verbinding (of de server heeft het even druk)? Dan later opnieuw proberen.
 * Een echte fout (bv. ongeldige gegevens) heeft geen zin om te herhalen.
 */
export function classify(res: { error: { message?: string; code?: string } | null; status?: number }): SendResult {
  if (!res.error) return 'ok';
  const status = res.status ?? 0;
  const msg = res.error.message ?? '';
  if (res.error.code === '23505') return 'ok'; // stond er al (vorige poging kwam wél aan)
  if (status === 0 || status === 401 || status === 408 || status === 429 || status >= 500) return 'later';
  if (/failed to fetch|load failed|networkerror|network request failed|fetch failed|timeout/i.test(msg)) return 'later';
  return { error: msg || `fout ${status}` };
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Oudere telefoons
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
