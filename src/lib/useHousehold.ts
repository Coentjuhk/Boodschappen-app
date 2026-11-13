import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, supabase } from './supabase';
import type { Household, Item, PriceRow, Settings, Store } from './types';
import { DEFAULT_STORES, guessCategory } from '../../shared/catalog';
import { normalizeQuery, type ParsedLine } from '../../shared/text';

const NAME_KEY = 'bs.name';
const DEVICE_KEY = 'bs.device';
export const getMyName = () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };
export const setMyName = (n: string) => { try { localStorage.setItem(NAME_KEY, n); } catch { /* */ } };

/** Inloggen zonder account: elke telefoon krijgt een anonieme gebruiker die lid wordt via de huishoudcode. */
export function useSession() {
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) return setUserId(data.session.user.id);
      // 1) Eerder voor deze telefoon aangemaakt account?
      let creds: { email: string; password: string } | null = null;
      try { creds = JSON.parse(localStorage.getItem(DEVICE_KEY) ?? 'null'); } catch { /* */ }
      if (creds) {
        const r = await supabase.auth.signInWithPassword(creds);
        if (!r.error) return setUserId(r.data.user!.id);
      }
      // 2) Anoniem inloggen (als dat aan staat in Supabase)
      const anon = await supabase.auth.signInAnonymously();
      if (!anon.error) return setUserId(anon.data.user!.id);
      // 3) Anders: de server maakt een account voor deze telefoon
      try {
        const r = await fetch('/api/device', { method: 'POST' });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Fout ' + r.status);
        try { localStorage.setItem(DEVICE_KEY, JSON.stringify(j)); } catch { /* */ }
        const s = await supabase.auth.signInWithPassword(j);
        if (s.error) throw s.error;
        setUserId(s.data.user!.id);
      } catch (e: any) {
        setError('Inloggen lukt niet: ' + (e.message ?? e));
      }
    })();
  }, []);
  return { userId, error };
}

export function useHousehold(userId: string | null) {
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase.from('members').select('households(*)').eq('user_id', userId).limit(1).maybeSingle();
    if (error && /does not exist|schema cache/i.test(error.message)) {
      setSetupError('De database is nog niet klaargezet. Plak supabase/schema.sql in Supabase (SQL Editor → Run) en herlaad.');
    }
    setHousehold(((data as any)?.households as Household) ?? null);
    setLoading(false);
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const create = async (name: string, displayName: string) => {
    const { data, error } = await supabase.rpc('create_household', { p_name: name, p_display_name: displayName });
    if (error) throw error;
    const h = data as Household;
    await supabase.from('stores').insert(
      DEFAULT_STORES.map((s, i) => ({
        household_id: h.id, name: s.name, chain: s.chain ?? null, kinds: s.kinds, location: s.location ?? null,
        online: !!s.online, delivery_fee: s.delivery_fee ?? 0, min_order: s.min_order ?? 0, enabled: s.enabled ?? true, sort: i,
      })),
    );
    setHousehold(h);
  };
  const join = async (code: string, displayName: string) => {
    const { data, error } = await supabase.rpc('join_household', { p_code: code, p_display_name: displayName });
    if (error) throw error;
    setHousehold(data as Household);
  };
  const saveSettings = async (patch: Partial<Settings>) => {
    if (!household) return;
    const settings = { ...household.settings, ...patch };
    setHousehold({ ...household, settings });
    await supabase.from('households').update({ settings }).eq('id', household.id);
  };
  return { household, loading, setupError, create, join, saveSettings, reload: load };
}

/** Lijst, winkels en prijzen — live gesynchroniseerd tussen jullie telefoons. */
export function useLiveData(householdId: string | undefined) {
  const [items, setItems] = useState<Item[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [priceErrors, setPriceErrors] = useState<string[]>([]);
  const queriesRef = useRef<string>('');

  const loadItems = useCallback(async () => {
    if (!householdId) return;
    const { data } = await supabase.from('items').select('*').eq('household_id', householdId).order('created_at');
    setItems((data as Item[]) ?? []);
  }, [householdId]);
  const loadStores = useCallback(async () => {
    if (!householdId) return;
    const { data } = await supabase.from('stores').select('*').eq('household_id', householdId).order('sort');
    setStores((data as Store[]) ?? []);
  }, [householdId]);

  useEffect(() => {
    if (!householdId) return;
    loadItems();
    loadStores();
    const ch = supabase
      .channel('hh-' + householdId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `household_id=eq.${householdId}` }, (p) => {
        setItems((cur) => {
          if (p.eventType === 'DELETE') return cur.filter((i) => i.id !== (p.old as Item).id);
          const row = p.new as Item;
          const idx = cur.findIndex((i) => i.id === row.id);
          if (idx === -1) return [...cur, row];
          const next = cur.slice(); next[idx] = row; return next;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores', filter: `household_id=eq.${householdId}` }, () => loadStores())
      .subscribe();
    // Terug in de app na een tijdje weg? Alles opnieuw ophalen.
    const onVisible = () => { if (document.visibilityState === 'visible') { loadItems(); loadStores(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVisible); };
  }, [householdId, loadItems, loadStores]);

  // Prijzen ophalen voor alles op de lijst
  const queries = useMemo(
    () => [...new Set(items.filter((i) => !i.checked).map((i) => normalizeQuery(i.name)))].sort(),
    [items],
  );
  const loadPrices = useCallback(async (qs: string[]) => {
    if (!qs.length) return setPrices([]);
    const { data } = await supabase.from('prices').select('*').in('query', qs);
    setPrices((data as PriceRow[]) ?? []);
  }, []);
  useEffect(() => {
    const key = queries.join('|');
    if (key === queriesRef.current) return;
    queriesRef.current = key;
    loadPrices(queries);
  }, [queries, loadPrices]);

  /** Actuele prijzen ophalen bij de winkels (voor de opgegeven producten, of alles wat nog niet vers is). */
  const refreshPrices = useCallback(async (only?: string[]) => {
    const fresh = new Date(Date.now() - 6 * 3600e3).toISOString();
    const todo = only ?? queries.filter((q) => !prices.some((p) => p.query === q && !p.household_id && p.fetched_at > fresh));
    if (!todo.length) return;
    setRefreshing(true);
    const errs = new Set<string>();
    try {
      for (let i = 0; i < todo.length; i += 10) {
        const r = await api<{ results: { errors: Record<string, string> }[] }>('/api/prices', { queries: todo.slice(i, i + 10) });
        r.results.forEach((x) => Object.entries(x.errors).forEach(([c, e]) => errs.add(`${c === 'ah' ? 'AH' : c.charAt(0).toUpperCase() + c.slice(1)} ${e}`)));
      }
    } catch (e: any) {
      errs.add(e.message);
    } finally {
      setPriceErrors([...errs]);
      await loadPrices(queries);
      setRefreshing(false);
    }
  }, [queries, prices, loadPrices]);

  const addItems = async (lines: ParsedLine[], addedBy: string, source?: string) => {
    if (!householdId || !lines.length) return;
    // Staat het al op de lijst (niet afgevinkt)? Dan hoeveelheid ophogen.
    const inserts = [];
    for (const l of lines) {
      const existing = items.find((i) => !i.checked && normalizeQuery(i.name) === normalizeQuery(l.name) && (i.unit ?? '') === (l.unit ?? ''));
      if (existing) {
        await supabase.from('items').update({ quantity: Number(existing.quantity) + l.quantity }).eq('id', existing.id);
      } else {
        inserts.push({
          household_id: householdId, name: l.name, quantity: l.quantity, unit: l.unit ?? null, note: l.note ?? null,
          category: guessCategory(l.name), added_by: addedBy, source: source ?? null,
        });
      }
    }
    if (inserts.length) {
      const { data } = await supabase.from('items').insert(inserts).select();
      if (data) setItems((cur) => [...cur.filter((c) => !data.some((d: any) => d.id === c.id)), ...(data as Item[])]);
      refreshPrices(inserts.map((i) => normalizeQuery(i.name)));
    }
  };

  const updateItem = async (id: string, patch: Partial<Item>) => {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    await supabase.from('items').update(patch).eq('id', id);
  };
  const deleteItem = async (id: string) => {
    setItems((cur) => cur.filter((i) => i.id !== id));
    await supabase.from('items').delete().eq('id', id);
  };
  const clearChecked = async () => {
    setItems((cur) => cur.filter((i) => !i.checked));
    await supabase.from('items').delete().eq('household_id', householdId!).eq('checked', true);
  };

  const setManualPrice = async (item: Item, store: Store, price: number | null) => {
    const query = normalizeQuery(item.name);
    await supabase.from('prices').delete().eq('household_id', householdId!).eq('store_id', store.id).eq('query', query);
    if (price != null) {
      await supabase.from('prices').insert(
        { household_id: householdId, store_id: store.id, query, product_id: 'handmatig', title: item.name, price, base_price: price },
      );
    }
    loadPrices(queries);
  };

  const saveStore = async (s: Partial<Store> & { id?: string }) => {
    if (s.id) await supabase.from('stores').update(s).eq('id', s.id);
    else await supabase.from('stores').insert({ ...s, household_id: householdId, sort: stores.length });
    loadStores();
  };
  const deleteStore = async (id: string) => { await supabase.from('stores').delete().eq('id', id); loadStores(); };

  return {
    items, stores, prices, refreshing, priceErrors,
    addItems, updateItem, deleteItem, clearChecked, refreshPrices, setManualPrice, saveStore, deleteStore,
  };
}
