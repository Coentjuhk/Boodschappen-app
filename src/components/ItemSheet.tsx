import { useState } from 'react';
import type { Item, Store } from '../lib/types';
import type { useLiveData } from '../lib/useHousehold';
import { packCount, type Assignment, type Candidate } from '../../shared/optimizer';
import { evaluateOffer } from '../../shared/offers';
import { CATEGORIES } from '../../shared/catalog';
import { euro } from '../../shared/text';
import { fmtDate } from './ListView';

type Data = ReturnType<typeof useLiveData>;

export default function ItemSheet({ item, stores, candidates, assignment, data, onClose }: {
  item: Item; stores: Store[]; candidates: Candidate[]; assignment?: Assignment; data: Data; onClose: () => void;
}) {
  const [manualStore, setManualStore] = useState(stores.find((s) => !s.chain || ['slager', 'bakker'].some((k) => s.kinds.includes(k)))?.id ?? stores[0]?.id);
  const [manualPrice, setManualPrice] = useState('');
  const qty = Number(item.quantity);
  const packs = packCount({ quantity: qty, unit: item.unit });
  const up = (patch: Partial<Item>) => data.updateItem(item.id, patch);

  // Per winkel de producten, goedkoopste eerst
  const byStore = new Map<string, Candidate[]>();
  for (const c of candidates) byStore.set(c.store_id, [...(byStore.get(c.store_id) ?? []), c]);
  for (const list of byStore.values()) list.sort((a, b) => evaluateOffer(a, packs).total - evaluateOffer(b, packs).total);
  const storeOrder = [...byStore.keys()].sort(
    (a, b) => evaluateOffer(byStore.get(a)![0], packs).total - evaluateOffer(byStore.get(b)![0], packs).total,
  );

  const pin = (c: Candidate) => {
    const store = stores.find((s) => s.id === c.store_id);
    const isPinned = item.pinned?.product_id === c.product_id && (c.product_id !== 'handmatig' || item.pinned?.store_id === c.store_id);
    up({ pinned: isPinned ? null : { chain: store?.chain ?? undefined, store_id: c.store_id, product_id: c.product_id, title: c.title } });
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <input className="title-input" defaultValue={item.name} onBlur={(e) => e.target.value.trim() && e.target.value !== item.name && up({ name: e.target.value.trim(), pinned: null })} />
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="form-grid">
          <label>Aantal
            <div className="stepper">
              <button onClick={() => up({ quantity: Math.max(1, qty - 1) })}>−</button>
              <input inputMode="decimal" value={String(qty).replace('.', ',')} onChange={(e) => { const n = Number(e.target.value.replace(',', '.')); if (n > 0) up({ quantity: n }); }} />
              <button onClick={() => up({ quantity: qty + 1 })}>+</button>
            </div>
          </label>
          <label>Eenheid
            <input defaultValue={item.unit ?? ''} placeholder="st, g, pak…" onBlur={(e) => up({ unit: e.target.value.trim() || null })} />
          </label>
          <label>Soort
            <select value={item.category} onChange={(e) => up({ category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
            </select>
          </label>
          <label>Winkel
            <select value={item.store_id ?? ''} onChange={(e) => up({ store_id: e.target.value || null })}>
              <option value="">Automatisch (beste keus)</option>
              {stores.filter((s) => s.enabled).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="wide">Notitie
            <input defaultValue={item.note ?? ''} placeholder="bv. merk, smaak, voor zaterdag" onBlur={(e) => up({ note: e.target.value.trim() || null })} />
          </label>
        </div>
        <div className="wait-box">
          <label className="row-field">
            <input type="checkbox" checked={item.wait_offer} onChange={(e) => up({ wait_offer: e.target.checked })} />
            <span>⏳ Wachten op aanbieding</span>
          </label>
          {item.wait_offer && (
            <label className="row-field small">
              <span>Of zodra het kost minder dan €</span>
              <input className="target" inputMode="decimal" defaultValue={item.target_price == null ? '' : String(item.target_price).replace('.', ',')} placeholder="optioneel"
                onBlur={(e) => { const n = Number(e.target.value.replace(',', '.')); up({ target_price: e.target.value.trim() && n > 0 ? n : null }); }} />
            </label>
          )}
          {item.wait_offer && <p className="muted small">{item.target_price != null ? 'Komt op de lijst als de prijs onder je richtprijs komt.' : 'Komt op de lijst zodra er een actie is. Tip: kies hieronder het juiste product (📌) zodat de app de juiste actie herkent.'}</p>}
        </div>
        {item.added_by && <p className="muted small">Toegevoegd door {item.added_by}{item.source ? ` · ${item.source}` : ''}</p>}

        <h3>Prijzen {item.pinned && <button className="link small" onClick={() => up({ pinned: null })}>vast product loslaten</button>}</h3>
        {candidates.some((c) => c.weak) && !item.pinned && (
          <p className="warn small">Niet zeker welk product je bedoelt. Tik het juiste aan (📌), dan rekent de app ermee.</p>
        )}
        {storeOrder.length === 0 && <p className="muted small">Nog geen prijzen gevonden. Probeer ↻ bovenaan, maak de naam specifieker (bv. "halfvolle melk"), of vul hieronder zelf een prijs in.</p>}
        {storeOrder.map((sid) => {
          const s = stores.find((x) => x.id === sid);
          return (
            <div key={sid} className="price-store">
              <div className="price-store-name">{s?.name}{assignment?.store_id === sid && <span className="tag green">gekozen</span>}</div>
              {byStore.get(sid)!.slice(0, 4).map((c) => {
                const ev = evaluateOffer(c, packs);
                const pinned = item.pinned?.product_id === c.product_id && (c.product_id !== 'handmatig' || item.pinned?.store_id === sid);
                return (
                  <button key={c.product_id} className={'product' + (pinned ? ' pinned' : '')} onClick={() => pin(c)}>
                    <div className="thumb">{c.image_url ? <img src={c.image_url} alt="" loading="lazy" /> : '🏷️'}</div>
                    <div className="info">
                      <div>{c.title}</div>
                      <div className="muted small">{c.size ?? ''}{c.size ? ' · ' : ''}{euro(c.price)} p/st</div>
                      {c.mechanic && <div className="offer">🏷️ {c.mechanic}{c.offer_until ? ` t/m ${fmtDate(c.offer_until)}` : ''}</div>}
                      {ev.bundleTip && <div className="tip">💡 {ev.bundleTip.text}</div>}
                    </div>
                    <div className="price">{euro(ev.total)}{pinned && <div className="small">📌</div>}</div>
                  </button>
                );
              })}
            </div>
          );
        })}

        <h3>Zelf een prijs invullen</h3>
        <p className="muted small">Voor de slager, bakker, Primera of een winkel zonder online prijzen. De app onthoudt het.</p>
        <div className="manual">
          <select value={manualStore} onChange={(e) => setManualStore(e.target.value)}>
            {stores.filter((s) => s.enabled).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input inputMode="decimal" placeholder={item.unit && packs === 1 && qty !== 1 ? `€ voor ${qty} ${item.unit}` : '€ per stuk'} value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} />
          <button className="secondary" onClick={() => {
            const n = Number(manualPrice.replace(',', '.').replace('€', '').trim());
            const st = stores.find((s) => s.id === manualStore);
            if (st && n > 0) { data.setManualPrice(item, st, n); setManualPrice(''); }
          }}>Opslaan</button>
        </div>

        <div className="sheet-actions">
          <button className="link danger" onClick={() => { data.deleteItem(item.id); onClose(); }}>Verwijderen</button>
          <button className="primary" onClick={() => { up({ checked: true }); onClose(); }}>✓ Afvinken</button>
        </div>
      </div>
    </div>
  );
}
