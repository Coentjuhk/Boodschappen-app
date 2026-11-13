import { useMemo, useState } from 'react';
import type { Household, Item, Pins } from '../lib/types';
import type { useLiveData } from '../lib/useHousehold';
import type { Prefs } from '../lib/prefs';
import { candidatesFor, cheapestUsed, dealsFor, upcomingFor } from '../lib/candidates';
import { plan, type Assignment, type Candidate } from '../../shared/optimizer';
import { CATEGORIES, CATEGORY_BY_ID } from '../../shared/catalog';
import { euro, normalizeQuery, parseList } from '../../shared/text';
import AddBar from './AddBar';
import ItemSheet from './ItemSheet';
import ReceiptSheet from './ReceiptSheet';

type Data = ReturnType<typeof useLiveData>;
const CAT_ORDER = Object.fromEntries(CATEGORIES.map((c, i) => [c.id, i]));

export default function ListView({ household, data, prefs, savePrefs, rememberPins, me }: {
  household: Household;
  data: Data;
  prefs: Prefs;
  savePrefs: (p: Partial<Prefs>) => void;
  rememberPins: (query: string, pins: Pins) => void;
  me: string;
}) {
  const { items, stores, prices } = data;
  const mode = prefs.mode;
  const [openId, setOpenId] = useState<string | null>(null);
  const [showChecked, setShowChecked] = useState(false);
  const [receipts, setReceipts] = useState<File[] | null>(null);
  const [waitText, setWaitText] = useState('');
  const [showWaiting, setShowWaiting] = useState(true);

  const enabled = useMemo(() => stores.filter((x) => x.enabled), [stores]);
  const active = useMemo(() => items.filter((i) => !i.checked), [items]);
  const done = useMemo(() => items.filter((i) => i.checked), [items]);

  const allCands = useMemo(() => {
    const m: Record<string, Candidate[]> = {};
    for (const i of active) m[i.id] = candidatesFor(i, prices, enabled);
    return m;
  }, [active, prices, enabled]);

  // Wachtlijst: alleen naar de boodschappenlijst als er nu een deal is (en dan alleen bij die winkel(s))
  const { todo, waiting, cands } = useMemo(() => {
    const todo: Item[] = [];
    const waiting: Item[] = [];
    const cands: Record<string, Candidate[]> = {};
    for (const i of active) {
      if (!i.wait_offer) { todo.push(i); cands[i.id] = allCands[i.id]; continue; }
      const deals = dealsFor(i, allCands[i.id] ?? []);
      if (deals.length) { todo.push(i); cands[i.id] = deals; } else waiting.push(i);
    }
    return { todo, waiting, cands };
  }, [active, allCands]);

  const selection = prefs.selection ?? enabled.map((x) => x.id);
  const single = enabled.some((x) => x.id === prefs.single) ? prefs.single! : enabled[0]?.id;

  const result = useMemo(() => plan(
    todo.map((i) => ({ id: i.id, name: i.name, quantity: Number(i.quantity), unit: i.unit, category: i.category, store_id: i.store_id })),
    cands,
    enabled.map((x) => ({ ...x, delivery_fee: Number(x.delivery_fee), min_order: Number(x.min_order) })),
    { mode, storeIds: mode === 'single' ? (single ? [single] : []) : selection, extraStorePenalty: prefs.extraStorePenalty },
  ), [todo, cands, enabled, mode, single, selection.join(','), prefs.extraStorePenalty]);

  // Groeperen per winkel, binnen de winkel op looproute (volgorde van de afdelingen)
  const groups = useMemo(() => {
    const g = new Map<string, Item[]>();
    for (const i of todo) {
      const sid = result.assignments[i.id]?.store_id ?? 'none';
      g.set(sid, [...(g.get(sid) ?? []), i]);
    }
    for (const list of g.values()) list.sort((a, b) => (CAT_ORDER[a.category] ?? 99) - (CAT_ORDER[b.category] ?? 99) || a.name.localeCompare(b.name));
    const order = (id: string) => (id === 'none' ? 999 : stores.find((x) => x.id === id)?.sort ?? 500);
    return [...g.entries()].sort((a, b) => order(a[0]) - order(b[0]));
  }, [todo, result, stores]);

  const totalSavings = Object.values(result.assignments).reduce((t, a) => t + (a.savings ?? 0), 0);
  const dealCount = todo.filter((i) => i.wait_offer).length;
  const open = openId ? items.find((x) => x.id === openId) : undefined;

  const check = (i: Item) => {
    data.updateItem(i.id, { checked: true });
    data.notify(`Afgevinkt: ${i.name}`, { label: 'Ongedaan maken', run: () => data.updateItem(i.id, { checked: false }) });
  };
  const addWaiting = () => {
    const l = parseList(waitText);
    if (!l.length) return;
    data.addItems(l, me, 'wachtlijst', { wait: true, pins: household.settings?.pins });
    setWaitText('');
  };

  return (
    <div className="list-view">
      <header className="top">
        <h1>Boodschappen</h1>
        <label className="icon-btn" title="Kassabon scannen (prijzen leren)" aria-label="Kassabon scannen">
          🧾
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) setReceipts(f); e.target.value = ''; }} />
        </label>
        <button className="icon-btn" title="Prijzen verversen" aria-label="Prijzen verversen" disabled={data.refreshing}
          onClick={() => { data.sync(); data.refreshPrices([...new Set(active.map((i) => normalizeQuery(i.name)))]); }}>
          {data.refreshing ? <span className="spinner small" /> : '↻'}
        </button>
      </header>

      <AddBar onAdd={(lines, source) => data.addItems(lines, me, source, { pins: household.settings?.pins })} />

      <section className="mode">
        <div className="segmented">
          {([['cheapest', 'Goedkoopst'], ['selection', 'Mijn winkels'], ['single', 'Eén winkel']] as const).map(([m, label]) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => savePrefs({ mode: m })}>{label}</button>
          ))}
        </div>
        {mode === 'selection' && (
          <div className="chips">
            {enabled.map((x) => (
              <button key={x.id} className={'chip' + (selection.includes(x.id) ? ' on' : '')}
                onClick={() => savePrefs({ selection: selection.includes(x.id) ? selection.filter((y) => y !== x.id) : [...selection, x.id] })}>
                {x.name}
              </button>
            ))}
          </div>
        )}
        {mode === 'single' && (
          <select value={single ?? ''} onChange={(e) => savePrefs({ single: e.target.value })}>
            {enabled.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
        {todo.length > 0 && (
          <div className="summary">
            <div><strong>{euro(result.total)}</strong><span className="muted"> geschat{result.unpriced ? ` · ${result.unpriced} zonder prijs` : ''}</span></div>
            <div className="muted small">
              {result.stores.length} {result.stores.length === 1 ? 'winkel' : 'winkels'}
              {result.fees > 0 && ` · incl. ${euro(result.fees)} bezorgen`}
              {totalSavings > 0 && <span className="save"> · {euro(totalSavings)} voordeel</span>}
            </div>
            {dealCount > 0 && <div className="deal small">🎯 {dealCount} van je wachtlijst nu in de aanbieding!</div>}
            {result.warnings.map((w) => <div key={w} className="warn small">⚠️ {w}</div>)}
            {data.priceErrors.length > 0 && <div className="warn small">{data.priceErrors.join(' · ')}: die prijzen ontbreken even.</div>}
          </div>
        )}
      </section>

      {todo.length === 0 && (
        <div className="empty">
          <p>{waiting.length ? 'Niets te halen vandaag 🎉' : 'De lijst is leeg 🎉'}</p>
          <p className="muted small">Typ hierboven, plak een hele lijst, of maak een foto van een recept.</p>
        </div>
      )}

      {groups.map(([sid, list]) => {
        const store = stores.find((x) => x.id === sid);
        const sub = list.reduce((t, i) => t + (result.assignments[i.id]?.total ?? 0), 0);
        return (
          <section key={sid} className="group">
            <h2>
              <span>{store ? store.name : 'Nog geen winkel'}{store?.online && <span className="tag">online</span>}</span>
              {sub > 0 && <span className="muted">{euro(sub)}</span>}
            </h2>
            <ul>
              {list.map((i) => (
                <Row key={i.id} item={i} a={result.assignments[i.id]} onCheck={() => check(i)} onOpen={() => setOpenId(i.id)} />
              ))}
            </ul>
          </section>
        );
      })}

      <section className="group waiting">
        <h2>
          <button className="link" onClick={() => setShowWaiting(!showWaiting)}>{showWaiting ? '▾' : '▸'} ⏳ Wachten op aanbieding ({waiting.length})</button>
        </h2>
        {showWaiting && (
          <>
            <div className="addrow wait-add">
              <input value={waitText} placeholder="bv. scheermesjes, knakworsten…" enterKeyHint="done"
                onChange={(e) => setWaitText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addWaiting(); }} />
              <button className="secondary" onClick={addWaiting}>Zet erop</button>
            </div>
            <p className="muted small">Komt vanzelf op je lijst zodra het ergens in de aanbieding is (of onder je richtprijs zakt).</p>
            {waiting.length > 0 && (
              <ul>
                {waiting.map((i) => {
                  const cs = allCands[i.id] ?? [];
                  const cheapest = cheapestUsed(cs);
                  const soon = upcomingFor(cs);
                  const name = (id?: string) => stores.find((x) => x.id === id)?.name ?? '?';
                  return (
                    <li key={i.id} className="row" onClick={() => setOpenId(i.id)}>
                      <div className="thumb">{cheapest?.image_url ? <img src={cheapest.image_url} alt="" loading="lazy" /> : <span>{CATEGORY_BY_ID[i.category]?.emoji ?? '⏳'}</span>}</div>
                      <div className="info">
                        <div className="name">{fmtQty(i)}{i.name}</div>
                        <div className="sub muted">
                          {cheapest ? `nu ${euro(cheapest.price)} bij ${name(cheapest.store_id)}` : 'nog geen prijs bekend'}
                          {i.target_price != null ? ` · wacht op ≤ ${euro(Number(i.target_price))}` : ' · wacht op actie'}
                        </div>
                        {soon && <div className="soon">📅 Vanaf {fmtDate(soon.upcoming!.from)} bij {name(soon.store_id)}: {soon.upcoming!.mechanic}</div>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>

      {done.length > 0 && (
        <section className="group done">
          <h2>
            <button className="link" onClick={() => setShowChecked(!showChecked)}>{showChecked ? '▾' : '▸'} Afgevinkt ({done.length})</button>
            <button className="link danger" onClick={() => {
              const ids = done.map((i) => i.id);
              const backup = done;
              data.clearChecked();
              data.notify(`${ids.length} afgevinkte ${ids.length === 1 ? 'product' : 'producten'} gewist`, {
                label: 'Ongedaan maken',
                run: () => data.restoreItems(backup),
              });
            }}>Wissen</button>
          </h2>
          {showChecked && (
            <ul>
              {done.map((i) => (
                <li key={i.id} className="row checked" onClick={() => data.updateItem(i.id, { checked: false })}>
                  <span className="check on" aria-hidden>✓</span>
                  <span className="name">{fmtQty(i)}{i.name}</span>
                  <span className="muted small">terugzetten</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {receipts && (
        <ReceiptSheet files={receipts} stores={stores} items={items} onSave={data.saveReceiptPrices} onClose={() => setReceipts(null)} />
      )}

      {open && (
        <ItemSheet
          item={open}
          stores={stores}
          candidates={allCands[open.id] ?? candidatesFor(open, prices, enabled)}
          assignment={result.assignments[open.id]}
          data={data}
          rememberPins={rememberPins}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

export function fmtQty(i: Pick<Item, 'quantity' | 'unit'>) {
  const q = Number(i.quantity);
  if (q === 1 && !i.unit) return '';
  return `${String(q).replace('.', ',')}${i.unit ? ' ' + i.unit : '×'} `;
}

function Row({ item, a, onCheck, onOpen }: { item: Item; a?: Assignment; onCheck: () => void; onOpen: () => void }) {
  const c = a?.candidate;
  const cat = CATEGORY_BY_ID[item.category];
  return (
    <li className="row">
      <button className="check" aria-label={`${item.name} afvinken`} onClick={onCheck} />
      <div className="thumb" onClick={onOpen}>
        {c?.image_url ? <img src={c.image_url} alt="" loading="lazy" /> : <span>{cat?.emoji ?? '🛒'}</span>}
      </div>
      <div className="info" onClick={onOpen}>
        <div className="name">{fmtQty(item)}{item.name}{item.wait_offer && <span className="tag deal-tag">🎯 wachtlijst</span>}</div>
        <div className="sub muted">
          {c ? <>{c.learned ? 'eigen prijs' : c.title}{c.size ? ` · ${c.size}` : ''}</> : item.note ?? (item.added_by ? `door ${item.added_by}` : '')}
        </div>
        {c?.mechanic && <div className="offer">🏷️ {c.mechanic}{c.offer_until ? ` t/m ${fmtDate(c.offer_until)}` : ''}</div>}
        {c?.upcoming && <div className="soon">📅 Vanaf {fmtDate(c.upcoming.from)}: {c.upcoming.mechanic}</div>}
        {a?.bundleTip && <div className="tip">💡 {a.bundleTip}</div>}
      </div>
      <div className="price" onClick={onOpen}>
        {a?.total != null ? (
          <>
            <div>{euro(a.total)}</div>
            {a.savings ? <div className="was">{euro(a.total + a.savings)}</div> : null}
          </>
        ) : <span className="muted">–</span>}
      </div>
    </li>
  );
}

export function fmtDate(d: string) {
  const dt = new Date(d + (d.length === 10 ? 'T12:00:00' : ''));
  return isNaN(+dt) ? d : dt.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
}
