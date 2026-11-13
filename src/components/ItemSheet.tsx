import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Item, Pins, Store } from '../lib/types';
import type { useLiveData } from '../lib/useHousehold';
import { pinsOf } from '../lib/candidates';
import { isUsed, packCount, type Assignment, type Candidate } from '../../shared/optimizer';
import { evaluateOffer } from '../../shared/offers';
import { AUTO_PRICE_CHAINS, CATEGORIES, CATEGORY_BY_ID } from '../../shared/catalog';
import { euro, normalizeQuery } from '../../shared/text';
import { fmtDate } from './ListView';

type Data = ReturnType<typeof useLiveData>;
const hasAutoPrices = (s: Store) => !!s.chain && (AUTO_PRICE_CHAINS as readonly string[]).includes(s.chain);

export default function ItemSheet({ item, stores, candidates, assignment, data, rememberPins, onClose }: {
  item: Item;
  stores: Store[];
  candidates: Candidate[];
  assignment?: Assignment;
  data: Data;
  rememberPins: (query: string, pins: Pins) => void;
  onClose: () => void;
}) {
  const enabled = stores.filter((s) => s.enabled);
  const qty = Number(item.quantity);
  const packs = packCount({ quantity: qty, unit: item.unit });
  const pins = pinsOf(item.pinned);
  const up = (patch: Partial<Item>) => data.updateItem(item.id, patch);

  // Voor "zelf een prijs invullen": de winkel waar dit product nu staat, als die geen automatische prijzen heeft;
  // anders de eerste winkel zonder automatische prijzen die dit soort product verkoopt.
  const kinds = CATEGORY_BY_ID[item.category]?.kinds ?? ['supermarkt'];
  const assigned = enabled.find((s) => s.id === (item.store_id ?? assignment?.store_id));
  const [manualStore, setManualStore] = useState(
    (assigned && !hasAutoPrices(assigned) ? assigned : undefined)?.id ??
    enabled.find((s) => !hasAutoPrices(s) && kinds.some((k) => s.kinds.includes(k)))?.id ??
    enabled.find((s) => !hasAutoPrices(s))?.id ??
    enabled[0]?.id ?? '',
  );
  const [manualPrice, setManualPrice] = useState('');
  const [showAll, setShowAll] = useState<string | null>(null);

  // Per winkel: eerst wat meetelt, dan de alternatieven, dan de twijfelgevallen
  const order = (c: Candidate) => (isUsed(c) ? 0 : c.weak ? 2 : 1);
  const byStore = new Map<string, Candidate[]>();
  for (const c of candidates) byStore.set(c.store_id, [...(byStore.get(c.store_id) ?? []), c]);
  for (const list of byStore.values()) list.sort((a, b) => order(a) - order(b));
  const priceOf = (sid: string) => {
    const first = byStore.get(sid)![0];
    return isUsed(first) ? evaluateOffer(first, packs).total : Infinity;
  };
  const storeOrder = [...byStore.keys()].sort((a, b) => priceOf(a) - priceOf(b));
  const nothingUsed = candidates.length > 0 && !candidates.some(isUsed);

  const choose = (c: Candidate) => {
    if (!c.pin_key) return;
    const next: Pins = { ...pins };
    if (c.pinned) delete next[c.pin_key];
    else next[c.pin_key] = { product_id: c.product_id, title: c.title };
    up({ pinned: Object.keys(next).length ? next : null });
    // Onthouden voor de volgende keer dat dit product op de lijst komt
    rememberPins(normalizeQuery(item.name), next);
  };

  const saveManual = () => {
    const n = Number(manualPrice.replace(',', '.').replace('€', '').trim());
    if (!manualStore || !(n > 0)) return;
    data.setManualPrice(item.name, item.name, manualStore, n);
    setManualPrice('');
  };

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <input className="title-input" aria-label="Naam" defaultValue={item.name} enterKeyHint="done"
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== item.name) up({ name: v, pinned: null }); }} />
          <button className="icon-btn" aria-label="Sluiten" onClick={onClose}>✕</button>
        </div>

        <div className="form-grid">
          <label>Aantal
            <div className="stepper">
              <button aria-label="Minder" onClick={() => up({ quantity: Math.max(1, Math.ceil(qty) - 1) })}>−</button>
              <input key={qty} inputMode="decimal" defaultValue={String(qty).replace('.', ',')}
                onBlur={(e) => { const n = Number(e.target.value.replace(',', '.')); if (n > 0 && n !== qty) up({ quantity: n }); else e.target.value = String(qty).replace('.', ','); }} />
              <button aria-label="Meer" onClick={() => up({ quantity: Math.floor(qty) + 1 })}>+</button>
            </div>
          </label>
          <label>Eenheid
            <input defaultValue={item.unit ?? ''} placeholder="st, g, pak…" onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== item.unit) up({ unit: v }); }} />
          </label>
          <label>Soort
            <select value={item.category} onChange={(e) => up({ category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
            </select>
          </label>
          <label>Winkel
            <select value={item.store_id ?? ''} onChange={(e) => up({ store_id: e.target.value || null })}>
              <option value="">Automatisch (beste keus)</option>
              {enabled.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="wide">Notitie
            <input defaultValue={item.note ?? ''} placeholder="bv. merk, smaak, voor zaterdag" onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== item.note) up({ note: v }); }} />
          </label>
        </div>

        <div className="wait-box">
          <label className="row-field">
            <input type="checkbox" checked={item.wait_offer} onChange={(e) => up({ wait_offer: e.target.checked })} />
            <span>⏳ Wachten op aanbieding</span>
          </label>
          {item.wait_offer && (
            <>
              <label className="row-field small">
                <span>Of zodra het minder kost dan €</span>
                <input className="target" inputMode="decimal" defaultValue={item.target_price == null ? '' : String(item.target_price).replace('.', ',')} placeholder="optioneel"
                  onBlur={(e) => { const n = Number(e.target.value.replace(',', '.')); up({ target_price: e.target.value.trim() && n > 0 ? n : null }); }} />
              </label>
              <p className="muted small">
                {item.target_price != null
                  ? 'Komt op de lijst als de prijs per stuk onder je richtprijs komt.'
                  : 'Komt op de lijst zodra er een actie is. Tip: kies hieronder het juiste product, dan let de app alleen op acties voor dát product.'}
              </p>
            </>
          )}
        </div>
        {item.added_by && <p className="muted small">Toegevoegd door {item.added_by}{item.source ? ` · ${item.source}` : ''}</p>}

        <h3>Prijzen per winkel</h3>
        {candidates.length > 0 && (
          <p className="muted small">Tik op een product om dát te kiezen (📌). De app onthoudt je keuze voor de volgende keer.</p>
        )}
        {nothingUsed && (
          <p className="warn small">Ik weet niet zeker welk product je bedoelt, dus er is nog geen prijs meegerekend. Kies het juiste product.</p>
        )}
        {storeOrder.length === 0 && (
          <p className="muted small">Nog geen prijzen gevonden. Probeer ↻ bovenaan, maak de naam specifieker (bv. "halfvolle melk"), of vul hieronder zelf een prijs in.</p>
        )}
        {storeOrder.map((sid) => {
          const s = stores.find((x) => x.id === sid);
          const list = byStore.get(sid)!;
          const shown = showAll === sid ? list : list.slice(0, 3);
          return (
            <div key={sid} className="price-store">
              <div className="price-store-name">{s?.name}{assignment?.store_id === sid && <span className="tag green">hier haal je het</span>}</div>
              {shown.map((c) => {
                const ev = evaluateOffer(c, packs);
                const used = isUsed(c);
                return (
                  <div key={c.product_id} className={'product' + (c.pinned ? ' pinned' : used ? ' used' : '')}>
                    <button className="product-main" onClick={() => choose(c)}>
                      <div className="thumb">{c.image_url ? <img src={c.image_url} alt="" loading="lazy" /> : c.learned ? '🧾' : '🏷️'}</div>
                      <div className="info">
                        <div>{c.title}</div>
                        <div className="muted small">
                          {c.learned ? 'eigen prijs · ' : ''}{c.size ? `${c.size} · ` : ''}{euro(c.price)} p/st
                          {c.pinned ? ' · 📌 jullie keuze' : used ? ' · telt mee' : ''}
                        </div>
                        {c.mechanic && <div className="offer">🏷️ {c.mechanic}{c.offer_until ? ` t/m ${fmtDate(c.offer_until)}` : ''}</div>}
                        {c.upcoming && <div className="soon">📅 Vanaf {fmtDate(c.upcoming.from)}: {c.upcoming.mechanic}</div>}
                        {ev.bundleTip && <div className="tip">💡 {ev.bundleTip.text}</div>}
                      </div>
                      <div className="price">{euro(ev.total)}</div>
                    </button>
                    {c.learned && (
                      <button className="product-del" aria-label="Eigen prijs verwijderen" title="Eigen prijs verwijderen"
                        onClick={() => data.setManualPrice(c.product_id.startsWith('handmatig:') ? c.product_id.slice(10) : item.name, c.title, sid, null)}>✕</button>
                    )}
                  </div>
                );
              })}
              {list.length > shown.length && (
                <button className="link small" onClick={() => setShowAll(sid)}>Toon nog {list.length - shown.length} {list.length - shown.length === 1 ? 'product' : 'producten'}</button>
              )}
            </div>
          );
        })}

        <h3>Zelf een prijs invullen</h3>
        <p className="muted small">Voor Lidl, de slager, bakker of een andere winkel zonder automatische prijzen. De app onthoudt het.</p>
        <div className="manual">
          <select value={manualStore} onChange={(e) => setManualStore(e.target.value)}>
            {enabled.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input inputMode="decimal" enterKeyHint="done" placeholder={item.unit && packs === 1 && qty !== 1 ? `€ voor ${String(qty).replace('.', ',')} ${item.unit}` : '€ per stuk'}
            value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveManual(); }} />
          <button className="secondary" onClick={saveManual}>Opslaan</button>
        </div>

        <div className="sheet-actions">
          <button className="link danger" onClick={() => {
            const backup = item;
            data.deleteItem(item.id);
            data.notify(`Verwijderd: ${item.name}`, { label: 'Ongedaan maken', run: () => data.restoreItems([backup]) });
            onClose();
          }}>Verwijderen</button>
          <button className="primary" onClick={() => {
            up({ checked: true });
            data.notify(`Afgevinkt: ${item.name}`, { label: 'Ongedaan maken', run: () => data.updateItem(item.id, { checked: false }) });
            onClose();
          }}>✓ Afvinken</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
