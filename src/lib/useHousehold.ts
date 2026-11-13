import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, authed, limit, supabase } from './supabase';
import type { Household, Item, Pins, PriceRow, Store } from './types';
import { applyOps, classify, enqueue, uuid, type Op } from './outbox';
import { load, remove, save } from './local';
import { DEFAULT_STORES, guessCategory } from '../../shared/catalog';
import { normalizeQuery, type ParsedLine } from '../../shared/text';

const NAME_KEY = 'bs.name';
const DEVICE_KEY = 'bs.device';
const HOUSEHOLD_KEY = 'bs.household';   // laatst gebruikte lijst (ook zonder bereik meteen zichtbaar)
const DECLINED_KEY = 'bs.declined';     // uitnodigingscodes waar je "nee" op zei
const TRIED_KEY = 'bs.tried';           // wanneer voor het laatst prijzen gezocht per product

// De naam stond vroeger als losse tekst opgeslagen; beide vormen worden gelezen.
export const getMyName = (): string => {
  try {
    const raw = localStorage.getItem(NAME_KEY) ?? '';
    return raw.startsWith('"') ? String(JSON.parse(raw)) : raw;
  } catch {
    return '';
  }
};
export const setMyName = (n: string) => save(NAME_KEY, n);

const isNetworkError = (e: { message?: string } | null | undefined, status?: number) =>
  !!e && (status === 0 || /failed to fetch|load failed|networkerror|fetch failed|network request failed/i.test(e.message ?? ''));

/** Inloggen zonder account: elke telefoon krijgt een eigen gebruiker die lid wordt via de code van de lijst. */
export function useSession() {
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const done = useRef(false);

  const start = useCallback(async () => {
    if (busy.current || done.current) return;
    busy.current = true;
    const ok = (id: string) => { done.current = true; setError(null); setUserId(id); };
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) return ok(data.session.user.id);
      // 1) Eerder voor deze telefoon aangemaakt account?
      const creds = load<{ email: string; password: string } | null>(DEVICE_KEY, null);
      if (creds) {
        const r = await supabase.auth.signInWithPassword(creds);
        if (!r.error) return ok(r.data.user!.id);
        if (isNetworkError(r.error, (r.error as { status?: number }).status)) throw r.error;
      }
      // 2) Anoniem inloggen (als dat aan staat in Supabase)
      const anon = await supabase.auth.signInAnonymously();
      if (!anon.error) return ok(anon.data.user!.id);
      if (isNetworkError(anon.error, (anon.error as { status?: number }).status)) throw anon.error;
      // 3) Anders: de server maakt een account voor deze telefoon
      const r = await fetch('/api/device', { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Fout ' + r.status);
      save(DEVICE_KEY, j);
      const s = await supabase.auth.signInWithPassword(j);
      if (s.error) throw s.error;
      ok(s.data.user!.id);
    } catch (e: any) {
      setError(isNetworkError(e) || !navigator.onLine ? 'Geen verbinding' : 'Inloggen lukt niet: ' + (e?.message ?? e));
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    start();
    // Sessie later weggevallen (bv. ingetrokken)? Dan opnieuw aanmelden met het account van deze telefoon.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { done.current = false; start(); }
    });
    // Zonder bereik gestart? Opnieuw proberen zodra er weer verbinding is.
    const retry = () => { if (document.visibilityState === 'visible') start(); };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => { sub.subscription.unsubscribe(); window.removeEventListener('online', retry); document.removeEventListener('visibilitychange', retry); };
  }, [start]);
  return { userId, error, retry: start };
}

export function useHousehold(userId: string | null) {
  const [household, setHousehold] = useState<Household | null>(() => load<Household | null>(HOUSEHOLD_KEY, null));
  const [loading, setLoading] = useState(() => !load<Household | null>(HOUSEHOLD_KEY, null));
  const [setupError, setSetupError] = useState<string | null>(null);
  const current = useRef<Household | null>(household);
  current.current = household;

  const adopt = useCallback((h: Household | null) => {
    setHousehold(h);
    if (h) save(HOUSEHOLD_KEY, h); else remove(HOUSEHOLD_KEY);
  }, []);

  const reload = useCallback(async () => {
    if (!userId) return;
    // Zonder geldige sessie zou het antwoord "nergens lid van" zijn: dan niets overnemen.
    if (!(await authed())) { setLoading(false); return; }
    const { data, error, status } = await supabase
      .from('members').select('created_at, households(*)').eq('user_id', userId).order('created_at', { ascending: false }).abortSignal(limit());
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) {
        setSetupError('De database is nog niet klaargezet. Plak supabase/schema.sql in Supabase (SQL Editor → Run) en herlaad.');
      }
      // Geen verbinding: gewoon verder met wat op de telefoon staat.
      if (!isNetworkError(error, status)) console.warn('[lijst]', error.message);
      setLoading(false);
      return;
    }
    if (!(await authed())) { setLoading(false); return; } // sessie viel weg tijdens het ophalen
    const all = ((data ?? []) as unknown as { households: Household | null }[]).map((m) => m.households).filter((h): h is Household => !!h);
    // De lijst die je het laatst gebruikte; anders de lijst waar je het laatst lid van werd.
    adopt(all.find((h) => h.id === current.current?.id) ?? all[0] ?? null);
    setLoading(false);
  }, [userId, adopt]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  const create = async (name: string, displayName: string) => {
    const { data, error } = await supabase.rpc('create_household', { p_name: name, p_display_name: displayName });
    if (error) throw error;
    const h = data as Household;
    const stores = await supabase.from('stores').insert(
      DEFAULT_STORES.map((s, i) => ({
        household_id: h.id, name: s.name, chain: s.chain ?? null, kinds: s.kinds, location: s.location ?? null,
        online: !!s.online, delivery_fee: s.delivery_fee ?? 0, min_order: s.min_order ?? 0, enabled: s.enabled ?? true, sort: i,
      })),
    );
    adopt(h);
    if (stores.error) throw new Error('De lijst is gemaakt, maar de winkels konden niet worden toegevoegd: ' + stores.error.message);
  };

  const join = async (code: string, displayName: string) => {
    const { data, error } = await supabase.rpc('join_household', { p_code: code, p_display_name: displayName });
    if (error) throw new Error(/onbekende code/i.test(error.message) ? 'Deze code ken ik niet. Controleer de letters en cijfers.' : error.message);
    const previous = current.current;
    // Stap je over naar een andere lijst, dan vraagt de oude uitnodiging (bv. in je beginscherm-app) er niet steeds opnieuw om.
    if (previous && previous.id !== (data as Household).id) declineCode(previous.join_code);
    adopt(data as Household);
  };

  /** Productkeuze onthouden voor het hele huishouden ("melk" = dit product). Leest eerst de laatste stand. */
  const rememberPins = async (query: string, pins: Pins) => {
    const h = current.current;
    if (!h || !query) return;
    const fresh = await supabase.from('households').select('settings').eq('id', h.id).maybeSingle();
    const settings = { ...((fresh.data?.settings as Household['settings']) ?? h.settings) };
    const all = { ...(settings.pins ?? {}) };
    if (Object.keys(pins).length) all[query] = pins; else delete all[query];
    settings.pins = all;
    adopt({ ...h, settings });
    const { error } = await supabase.from('households').update({ settings }).eq('id', h.id);
    if (error) console.warn('[keuze onthouden]', error.message);
  };

  return { household, loading, setupError, create, join, rememberPins, reload };
}

export const declinedCodes = () => load<string[]>(DECLINED_KEY, []);
export function declineCode(code: string) {
  save(DECLINED_KEY, [...new Set([...declinedCodes(), code.toUpperCase()])].slice(-20));
}

export interface Notice { id: number; text: string; action?: { label: string; run: () => void } }
let noticeSeq = 0;

/** Lijst, winkels en prijzen: direct zichtbaar vanaf de telefoon, live gesynchroniseerd zodra er verbinding is. */
export function useLiveData(householdId: string | undefined) {
  const hh = householdId;
  const key = useCallback((name: string) => `bs.${hh}.${name}`, [hh]);

  const server = useRef<Item[]>([]);     // laatst bekende stand van de server
  const outbox = useRef<Op[]>([]);       // wijzigingen die nog verstuurd moeten worden
  const sending = useRef(false);
  const jobs = useRef<Promise<unknown>>(Promise.resolve()); // netwerkwerk netjes na elkaar
  const dirty = useRef(false);           // er kwam een live-wijziging binnen tijdens het ophalen

  const [items, setItems] = useState<Item[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [pricesFor, setPricesFor] = useState<string | null>(null); // voor welke producten de prijzen geladen zijn
  const [refreshing, setRefreshing] = useState(false);
  const [priceErrors, setPriceErrors] = useState<string[]>([]);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);

  const notify = useCallback((text: string, action?: Notice['action']) => {
    const id = ++noticeSeq;
    setNotice({ id, text, action });
    setTimeout(() => setNotice((n) => (n?.id === id ? null : n)), action ? 7000 : 5000);
  }, []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  /** Scherm bijwerken en de stand op de telefoon bewaren. */
  const render = useCallback(() => {
    setItems(applyOps(server.current, outbox.current));
    setPending(outbox.current.length);
    if (hh) { save(key('items'), server.current); save(key('outbox'), outbox.current); }
  }, [hh, key]);

  const run = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const next = jobs.current.then(job, job);
    jobs.current = next.catch(() => undefined);
    return next;
  }, []);

  /** Wachtrij versturen. Stopt bij een verbindingsprobleem en probeert het later opnieuw. */
  const flush = useCallback(async (): Promise<boolean> => {
    while (outbox.current.length) {
      // Zonder sessie zou "aanpassen" stilletjes niets doen: dan wachten tot er weer een sessie is.
      if (!(await authed())) { setOffline(true); return false; }
      const op = outbox.current[0];
      sending.current = true;
      let result;
      try {
        if (op.t === 'insert') {
          const { created_at: _c, updated_at: _u, ...row } = op.row;
          result = classify(await supabase.from('items').insert(row).abortSignal(limit()));
        } else if (op.t === 'update') {
          result = classify(await supabase.from('items').update(op.patch).eq('id', op.id).abortSignal(limit()));
        } else {
          result = classify(await supabase.from('items').delete().eq('id', op.id).abortSignal(limit()));
        }
      } catch {
        result = 'later' as const;
      } finally {
        sending.current = false;
      }
      if (result === 'later') { setOffline(true); return false; }
      outbox.current = outbox.current.slice(1);
      setOffline(false); // de server gaf antwoord, dus er is weer verbinding
      if (result === 'ok') server.current = applyOps(server.current, [op]);
      else notify('Opslaan mislukt: ' + result.error);
      render();
    }
    return true;
  }, [render, notify]);

  /** Eerst versturen wat nog klaarstaat, dan de laatste stand ophalen. */
  const sync = useCallback(() => run(async () => {
    if (!hh) return;
    if (!(await flush())) return;
    if (!(await authed())) { setOffline(true); return; }
    dirty.current = false;
    const [i, s] = await Promise.all([
      supabase.from('items').select('*').eq('household_id', hh).order('created_at').abortSignal(limit()),
      supabase.from('stores').select('*').eq('household_id', hh).order('sort').abortSignal(limit()),
    ]);
    if (i.error || s.error) {
      setOffline(isNetworkError(i.error, i.status) || isNetworkError(s.error, s.status));
      return;
    }
    // Sessie weggevallen terwijl we ophaalden? Dan is het antwoord mogelijk leeg: niet overnemen.
    if (!(await authed())) { setOffline(true); return; }
    setOffline(false);
    if (!dirty.current) server.current = i.data as Item[];
    setStores(s.data as Store[]);
    save(key('stores'), s.data);
    render();
    if (dirty.current) setTimeout(() => sync(), 300);
  }), [hh, flush, render, run, key]);

  const push = useCallback((...ops: Op[]) => {
    for (const op of ops) outbox.current = enqueue(outbox.current, op, sending.current);
    render();
    run(flush);
  }, [render, run, flush]);

  useEffect(() => {
    if (!hh) return;
    // 1. Meteen tonen wat op de telefoon staat
    server.current = load<Item[]>(key('items'), []);
    outbox.current = load<Op[]>(key('outbox'), []);
    setStores(load<Store[]>(key('stores'), []));
    setPrices(load<PriceRow[]>(key('prices'), []));
    setPricesFor(null);
    render();
    // 2. Bijwerken vanaf de server, en live meekijken
    sync();
    const upsert = (row: Item) => {
      dirty.current = true;
      const idx = server.current.findIndex((i) => i.id === row.id);
      server.current = idx === -1 ? [...server.current, row] : server.current.map((i) => (i.id === row.id ? row : i));
      render();
    };
    const filter = `household_id=eq.${hh}`;
    let subscribedOnce = false;
    const ch = supabase
      .channel('hh-' + hh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'items', filter }, (p) => upsert(p.new as Item))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'items', filter }, (p) => upsert(p.new as Item))
      // Verwijderen meldt alleen het id (zonder filter), dus dat vangen we apart op.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'items' }, (p) => {
        const id = (p.old as { id?: string }).id;
        if (!id || !server.current.some((i) => i.id === id)) return;
        dirty.current = true;
        server.current = server.current.filter((i) => i.id !== id);
        render();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores', filter }, () => sync())
      .subscribe((status) => {
        // Na een onderbreking (tunnel, vliegtuigstand) kan er iets gemist zijn: opnieuw ophalen.
        if (status === 'SUBSCRIBED') { if (subscribedOnce) sync(); subscribedOnce = true; }
      });
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    // Elke 45 seconden bijwerken; staat er nog iets te wachten, dan elke 15 seconden opnieuw proberen.
    let ticks = 0;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      ticks += 1;
      if (outbox.current.length || ticks % 3 === 0) sync();
    }, 15_000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [hh, key, render, sync]);

  // ---------- Prijzen ----------
  const queries = useMemo(
    () => [...new Set(items.filter((i) => !i.checked).map((i) => normalizeQuery(i.name)).filter(Boolean))].sort(),
    [items],
  );
  const queriesKey = queries.join('|');
  const latestQueries = useRef(queries);
  latestQueries.current = queries;

  const loadPrices = useCallback(async () => {
    if (!hh) return;
    const qs = latestQueries.current;
    const forKey = qs.join('|');
    // In porties: de database geeft hooguit 1000 rijen per vraag terug.
    const chunks: string[][] = [];
    for (let i = 0; i < qs.length; i += 40) chunks.push(qs.slice(i, i + 40));
    if (!(await authed())) return;
    const results = await Promise.all([
      supabase.from('prices').select('*').eq('household_id', hh).limit(2000).abortSignal(limit()),
      ...chunks.map((c) => supabase.from('prices').select('*').is('household_id', null).in('query', c).abortSignal(limit())),
    ]);
    if (results.some((r) => r.error) || !(await authed())) return; // geen verbinding: de bewaarde prijzen blijven staan
    const rows = results.flatMap((r) => (r.data as PriceRow[]) ?? []);
    setPrices(rows);
    setPricesFor(forKey);
    save(key('prices'), rows);
  }, [hh, key]);

  useEffect(() => { loadPrices(); }, [queriesKey, loadPrices]);

  const fetching = useRef(new Set<string>());
  /** Actuele prijzen ophalen bij de winkels: voor de opgegeven producten, of voor alles wat verouderd is. */
  const refreshPrices = useCallback(async (only?: string[]) => {
    const now = Date.now();
    const since = new Date(now - 6 * 3600e3).toISOString();
    const tried = load<Record<string, number>>(TRIED_KEY, {});
    const isFresh = (q: string) => prices.some((p) => p.query === q && !p.household_id && p.match != null && p.fetched_at > since);
    const todo = (only ?? latestQueries.current.filter((q) => !isFresh(q) && !((tried[q] ?? 0) > now - 6 * 3600e3)))
      .filter((q) => q && !fetching.current.has(q));
    if (!todo.length || !(await authed())) return;
    todo.forEach((q) => fetching.current.add(q));
    setRefreshing(true);
    const errs = new Set<string>();
    try {
      for (let i = 0; i < todo.length; i += 10) {
        const batch = todo.slice(i, i + 10);
        const r = await api<{ results: { errors: Record<string, string> }[] }>('/api/prices', { queries: batch });
        r.results.forEach((x) => Object.entries(x.errors).forEach(([c, e]) => errs.add(`${c === 'ah' ? 'AH' : c.charAt(0).toUpperCase() + c.slice(1)} ${e}`)));
        batch.forEach((q) => { tried[q] = now; });
      }
    } catch (e: any) {
      if (!isNetworkError(e) && navigator.onLine) errs.add(e.message);
    } finally {
      todo.forEach((q) => fetching.current.delete(q));
      // Onthouden wat geprobeerd is, zodat producten zonder resultaat niet bij elke start opnieuw gezocht worden.
      const keep = Object.fromEntries(Object.entries(tried).filter(([, t]) => t > now - 24 * 3600e3));
      save(TRIED_KEY, keep);
      setPriceErrors([...errs]);
      await loadPrices();
      setRefreshing(false);
    }
  }, [prices, loadPrices]);

  // Verouderde prijzen (ouder dan 6 uur) vanzelf verversen: bij openen, en als je later terugkomt in de app.
  const lastAuto = useRef(0);
  useEffect(() => {
    if (!hh || pricesFor !== queriesKey || !queriesKey || offline) return;
    if (Date.now() - lastAuto.current < 10 * 60e3) return;
    const t = setTimeout(() => { lastAuto.current = Date.now(); refreshPrices(); }, 800);
    return () => clearTimeout(t);
  }, [hh, pricesFor, queriesKey, offline, refreshPrices]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') { loadPrices(); setPricesFor(null); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadPrices]);

  // ---------- Lijst bewerken (werkt ook zonder bereik) ----------
  const addItems = (lines: ParsedLine[], addedBy: string, source?: string, opts: { wait?: boolean; pins?: Record<string, Pins> } = {}) => {
    if (!hh || !lines.length) return;
    const now = new Date().toISOString();
    let view = applyOps(server.current, outbox.current);
    const ops: Op[] = [];
    const fresh: string[] = [];
    for (const l of lines) {
      const q = normalizeQuery(l.name);
      // Staat het al op de lijst (niet afgevinkt)? Dan de hoeveelheid ophogen.
      const existing = view.find((i) => !i.checked && i.wait_offer === !!opts.wait && normalizeQuery(i.name) === q && (i.unit ?? '') === (l.unit ?? ''));
      if (existing) {
        const quantity = Number(existing.quantity) + l.quantity;
        ops.push({ t: 'update', id: existing.id, patch: { quantity } });
        view = view.map((i) => (i.id === existing.id ? { ...i, quantity } : i));
      } else {
        const row: Item = {
          id: uuid(), household_id: hh, name: l.name, quantity: l.quantity, unit: l.unit ?? null, note: l.note ?? null,
          category: guessCategory(l.name), store_id: null, pinned: opts.pins?.[q] ?? null, checked: false,
          wait_offer: !!opts.wait, target_price: null, added_by: addedBy || null, source: source ?? null, created_at: now, updated_at: now,
        };
        ops.push({ t: 'insert', row });
        view = [...view, row];
        fresh.push(q);
      }
    }
    push(...ops);
    if (fresh.length) refreshPrices(fresh);
  };

  const updateItem = (id: string, patch: Partial<Item>) => push({ t: 'update', id, patch });
  const deleteItem = (id: string) => push({ t: 'delete', id });
  /** Verwijderde producten terugzetten ("Ongedaan maken"). */
  const restoreItems = (rows: Item[]) => push(...rows.map((row): Op => ({ t: 'insert', row })));
  const clearChecked = () => push(...applyOps(server.current, outbox.current).filter((i) => i.checked).map((i): Op => ({ t: 'delete', id: i.id })));

  // ---------- Eigen prijzen en winkels (alleen met verbinding) ----------
  const fail = (what: string, error: { message?: string } | null) => {
    if (!error) return false;
    notify(isNetworkError(error) || !navigator.onLine ? `${what} lukt niet zonder verbinding.` : `${what} mislukt: ${error.message}`);
    return true;
  };

  /** Eigen prijs voor een product bij een winkel zetten (of wissen met null). */
  const setManualPrice = async (query: string, title: string, storeId: string, price: number | null) => {
    const q = normalizeQuery(query);
    const del = await supabase.from('prices').delete().eq('household_id', hh!).eq('store_id', storeId).eq('query', q);
    if (fail('Prijs opslaan', del.error)) return;
    if (price != null) {
      const ins = await supabase.from('prices').insert(
        { household_id: hh, store_id: storeId, query: q, product_id: 'handmatig', title, price, base_price: price },
      );
      if (fail('Prijs opslaan', ins.error)) return;
    }
    await loadPrices();
  };

  /** Prijzen van een kassabon opslaan als eigen prijzen voor die winkel. */
  const saveReceiptPrices = async (storeId: string, entries: { name: string; price: number; title: string }[]) => {
    const rows = new Map(entries.map((e) => [normalizeQuery(e.name), e]));
    const qs = [...rows.keys()].filter(Boolean);
    if (!qs.length) return;
    const del = await supabase.from('prices').delete().eq('household_id', hh!).eq('store_id', storeId).in('query', qs);
    if (del.error) throw del.error;
    const { error } = await supabase.from('prices').insert(qs.map((q) => {
      const e = rows.get(q)!;
      return { household_id: hh, store_id: storeId, query: q, product_id: 'handmatig', title: e.title, price: e.price, base_price: e.price };
    }));
    if (error) throw error;
    await loadPrices();
  };

  const saveStore = async (s: Partial<Store> & { id?: string }) => {
    const res = s.id
      ? await supabase.from('stores').update(s).eq('id', s.id)
      : await supabase.from('stores').insert({ ...s, household_id: hh, sort: stores.length });
    if (!fail('Winkel opslaan', res.error)) sync();
  };
  const deleteStore = async (id: string) => {
    const res = await supabase.from('stores').delete().eq('id', id);
    if (!fail('Winkel verwijderen', res.error)) sync();
  };

  return {
    items, stores, prices, refreshing, priceErrors, offline, pending, notice,
    notify, dismissNotice, sync,
    addItems, updateItem, deleteItem, restoreItems, clearChecked, refreshPrices, setManualPrice, saveReceiptPrices, saveStore, deleteStore,
  };
}
