import { useMemo, useState } from 'react';
import type { Household, Item, Settings } from '../lib/types';
import type { useLiveData } from '../lib/useHousehold';
import { candidatesFor } from '../lib/candidates';
import { plan, type Assignment, type Candidate } from '../../shared/optimizer';
import { CATEGORIES, CATEGORY_BY_ID } from '../../shared/catalog';
import { euro, normalizeQuery } from '../../shared/text';
import AddBar from './AddBar';
import ItemSheet from './ItemSheet';

type Data = ReturnType<typeof useLiveData>;

export default function ListView({ household, data, saveSettings, me }: {
  household: Household; data: Data; saveSettings: (p: Partial<Settings>) => void; me: string;
}) {
  const { items, stores, prices } = data;
  const s = household.settings;
  const mode = s.mode ?? 'cheapest';
  const enabled = stores.filter((x) => x.enabled);
  const [open, setOpen] = useState<Item | null>(null);
  const [showChecked, setShowChecked] = useState(false);

  const todo = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);

  const cands = useMemo(() => {
    const m: Record<string, Candidate[]> = {};
    for (const i of todo) m[i.id] = candidatesFor(i, prices, enabled);
    return m;
  }, [todo, prices, enabled]);

  const result = useMemo(() => plan(
    todo.map((i) => ({ id: i.id, name: i.name, quantity: Number(i.quantity), unit: i.unit, category: i.category, store_id: i.store_id })),
    cands,
    enabled.map((x) => ({ ...x, delivery_fee: Number(x.delivery_fee), min_order: Number(x.min_order) })),
    {
      mode,
      storeIds: mode === 'single' ? [s.single ?? enabled[0]?.id].filter(Boolean) as string[] : (s.selection ?? enabled.map((x) => x.id)),
      extraStorePenalty: s.extraStorePenalty ?? 1.5,
    },
  ), [todo, cands, enabled, mode, s.single, s.selection, s.extraStorePenalty]);

  // Groeperen per winkel, binnen winkel op looproute (categorievolgorde)
  const catOrder = Object.fromEntries(CATEGORIES.map((c, i) => [c.id, i]));
  const groups = useMemo(() => {
    const g = new Map<string, Item[]>();
    for (const i of todo) {
      const sid = result.assignments[i.id]?.store_id ?? 'none';
      g.set(sid, [...(g.get(sid) ?? []), i]);
    }
    for (const list of g.values()) list.sort((a, b) => (catOrder[a.category] ?? 99) - (catOrder[b.category] ?? 99) || a.name.localeCompare(b.name));
    const order = (id: string) => (id === 'none' ? 999 : stores.find((x) => x.id === id)?.sort ?? 500);
    return [...g.entries()].sort((a, b) => order(a[0]) - order(b[0]));
  }, [todo, result, stores]);

  const totalSavings = Object.values(result.assignments).reduce((t, a) => t + (a.savings ?? 0), 0);
  const selection = s.selection ?? enabled.map((x) => x.id);

  return (
    <div className="list-view">
      <header className="top">
        <h1>Boodschappen</h1>
        <button className="icon-btn" title="Prijzen verversen" disabled={data.refreshing}
          onClick={() => data.refreshPrices([...new Set(todo.map((i) => normalizeQuery(i.name)))])}>
          {data.refreshing ? <span className="spinner small" /> : '↻'}
        </button>
      </header>

      <AddBar onAdd={(lines, source) => data.addItems(lines, me, source)} />

      <section className="mode">
        <div className="segmented">
          {([['cheapest', 'Goedkoopst'], ['selection', 'Mijn winkels'], ['single', 'Eén winkel']] as const).map(([m, label]) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => saveSettings({ mode: m })}>{label}</button>
          ))}
        </div>
        {mode === 'selection' && (
          <div className="chips">
            {enabled.map((x) => (
              <button key={x.id} className={'chip' + (selection.includes(x.id) ? ' on' : '')}
                onClick={() => saveSettings({ selection: selection.includes(x.id) ? selection.filter((y) => y !== x.id) : [...selection, x.id] })}>
                {x.name}
              </button>
            ))}
          </div>
        )}
        {mode === 'single' && (
          <select value={s.single ?? enabled[0]?.id} onChange={(e) => saveSettings({ single: e.target.value })}>
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
            {result.warnings.map((w) => <div key={w} className="warn small">⚠️ {w}</div>)}
            {data.priceErrors.length > 0 && <div className="warn small">{data.priceErrors.join(' · ')}: die prijzen ontbreken even.</div>}
          </div>
        )}
      </section>

      {todo.length === 0 && (
        <div className="empty">
          <p>De lijst is leeg 🎉</p>
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
                <Row key={i.id} item={i} a={result.assignments[i.id]} onToggle={() => data.updateItem(i.id, { checked: true })} onOpen={() => setOpen(i)} />
              ))}
            </ul>
          </section>
        );
      })}

      {done.length > 0 && (
        <section className="group done">
          <h2>
            <button className="link" onClick={() => setShowChecked(!showChecked)}>{showChecked ? '▾' : '▸'} Afgevinkt ({done.length})</button>
            <button className="link danger" onClick={() => data.clearChecked()}>Wissen</button>
          </h2>
          {showChecked && (
            <ul>
              {done.map((i) => (
                <li key={i.id} className="row checked" onClick={() => data.updateItem(i.id, { checked: false })}>
                  <span className="check on">✓</span>
                  <span className="name">{fmtQty(i)}{i.name}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {open && (
        <ItemSheet
          item={items.find((x) => x.id === open.id) ?? open}
          stores={stores}
          candidates={cands[open.id] ?? []}
          assignment={result.assignments[open.id]}
          data={data}
          onClose={() => setOpen(null)}
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

function Row({ item, a, onToggle, onOpen }: { item: Item; a?: Assignment; onToggle: () => void; onOpen: () => void }) {
  const c = a?.candidate;
  const cat = CATEGORY_BY_ID[item.category];
  return (
    <li className="row">
      <button className="check" aria-label="Afvinken" onClick={onToggle} />
      <div className="thumb" onClick={onOpen}>
        {c?.image_url ? <img src={c.image_url} alt="" loading="lazy" /> : <span>{cat?.emoji ?? '🛒'}</span>}
      </div>
      <div className="info" onClick={onOpen}>
        <div className="name">{fmtQty(item)}{item.name}</div>
        <div className="sub muted">
          {c ? <>{c.title}{c.size ? ` · ${c.size}` : ''}</> : item.note ?? (item.added_by ? `door ${item.added_by}` : '')}
        </div>
        {c?.mechanic && <div className="offer">🏷️ {c.mechanic}{c.offer_until ? ` t/m ${fmtDate(c.offer_until)}` : ''}</div>}
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
  const dt = new Date(d);
  return isNaN(+dt) ? d : dt.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
}
