import { useState } from 'react';
import { load, save } from './local';
import type { Household } from './types';

/** Hoe jíj de lijst bekijkt. Per telefoon, zodat de één "Goedkoopst" kan gebruiken en de ander "Eén winkel". */
export interface Prefs {
  mode: 'cheapest' | 'selection' | 'single';
  selection?: string[];        // winkel-id's bij "Mijn winkels"
  single?: string;             // winkel-id bij "Eén winkel"
  extraStorePenalty: number;   // zoveel moet een extra winkel minstens opleveren
}

export function usePrefs(household: Household) {
  const key = `bs.${household.id}.prefs`;
  const [prefs, setPrefs] = useState<Prefs>(() => {
    const s = household.settings ?? {};
    // Eerste keer: overnemen wat eerder voor het hele huishouden was ingesteld.
    const legacy = { mode: s.mode ?? 'cheapest', selection: s.selection, single: s.single, extraStorePenalty: s.extraStorePenalty ?? 1.5 };
    return { ...legacy, ...load<Partial<Prefs>>(key, {}) };
  });
  const savePrefs = (patch: Partial<Prefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch };
      save(key, next);
      return next;
    });
  return { prefs, savePrefs };
}
