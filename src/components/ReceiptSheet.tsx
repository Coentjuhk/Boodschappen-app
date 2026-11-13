import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { readText } from '../lib/ocr';
import { stem } from '../lib/candidates';
import type { Item, Store } from '../lib/types';
import { netUnitPrice, parseReceipt, type ReceiptLine } from '../../shared/receipt';
import { euro, normalizeQuery } from '../../shared/text';

interface Row { line: ReceiptLine; name: string; price: string; on: boolean }
interface Bon { storeId: string; rows: Row[]; total: number | null; raw: string }

/** Naam op de bon ("HALFV MELK") koppelen aan een product op jullie lijst ("Halfvolle melk"), als dat lukt. */
function matchItem(receiptName: string, items: Item[]): string | null {
  const r = normalizeQuery(receiptName).replace(/(.)\1+/g, '$1');
  let best: { name: string; score: number } | null = null;
  for (const i of items) {
    const words = normalizeQuery(i.name).split(' ').filter((w) => w.length > 2).map(stem);
    if (!words.length) continue;
    const hits = words.filter((w) => r.includes(w) || r.includes(w.slice(0, 4))).length;
    const score = hits / words.length;
    if (score >= 0.99 && (!best || score > best.score)) best = { name: i.name, score };
  }
  return best?.name ?? null;
}

export default function ReceiptSheet({ files, stores, items, onSave, onClose }: {
  files: File[];
  stores: Store[];
  items: Item[];
  onSave: (storeId: string, entries: { name: string; price: number; title: string }[]) => Promise<void>;
  onClose: () => void;
}) {
  const [bons, setBons] = useState<Bon[] | null>(null);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRaw, setShowRaw] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const texts = await readText(files, (i, p) => !cancelled && setProgress([i, p]));
        if (cancelled) return;
        setBons(texts.map((raw) => {
          const r = parseReceipt(raw);
          // Winkel van de bon: fysieke winkel van die keten (niet de bezorgdienst), anders de eerste
          const store =
            stores.find((s) => s.enabled && r.chain && s.chain === r.chain && !s.online) ??
            stores.find((s) => r.chain && s.chain === r.chain) ??
            stores.find((s) => s.chain === 'lidl') ??
            stores[0];
          return {
            storeId: store?.id ?? '',
            total: r.total,
            raw,
            rows: r.lines.map((line) => ({ line, name: matchItem(line.name, items) ?? line.name, price: line.price.toFixed(2).replace('.', ','), on: true })),
          };
        }));
      } catch (e: any) {
        if (!cancelled) setErr(e.message ?? String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [files]);

  const update = (b: number, r: number, patch: Partial<Row>) =>
    setBons((cur) => cur!.map((bon, i) => (i !== b ? bon : { ...bon, rows: bon.rows.map((row, j) => (j === r ? { ...row, ...patch } : row)) })));

  const save = async () => {
    if (!bons) return;
    setBusy(true);
    try {
      let n = 0;
      for (const bon of bons) {
        const entries = bon.rows
          .filter((r) => r.on && r.name.trim())
          .map((r) => ({ name: r.name.trim(), price: Number(r.price.replace(',', '.')), title: r.line.name }))
          .filter((e) => e.price > 0);
        if (bon.storeId && entries.length) { await onSave(bon.storeId, entries); n += entries.length; }
      }
      setSaved(`${n} prijzen opgeslagen. De app gebruikt ze voortaan bij het vergelijken.`);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>🧾 {files.length > 1 ? `${files.length} kassabonnen` : 'Kassabon'}</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {!bons && !err && (
          <div className="reading">
            <div><span className="spinner" /> Bon {progress[0] + 1} van {files.length} lezen… {Math.round(progress[1] * 100)}%</div>
            <p className="muted small">De eerste keer duurt dit wat langer (taalbestand downloaden).</p>
          </div>
        )}
        {err && <p className="error">{err}</p>}
        {saved && (
          <>
            <p className="deal">✓ {saved}</p>
            <button className="primary big" onClick={onClose}>Klaar</button>
          </>
        )}

        {bons && !saved && (
          <>
            <p className="muted small">Controleer de namen: gebruik dezelfde naam als op je lijst (bv. "Halfvolle melk"), dan koppelt de app de prijs. Tik ✓ uit voor regels die niet kloppen.</p>
            {bons.map((bon, b) => {
              // Ter controle: zelfde som als de bon (inclusief kortingen), dan is alles goed gelezen
              const sum = bon.rows.reduce((t, r) => t + (Number(r.price.replace(',', '.')) || 0) * r.line.quantity - (r.line.discount ?? 0), 0);
              return (
                <div key={b} className="bon">
                  <div className="bon-head">
                    <select value={bon.storeId} onChange={(e) => setBons(bons.map((x, i) => (i === b ? { ...x, storeId: e.target.value } : x)))}>
                      {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <span className="muted small">{bon.rows.length} regels{bon.total ? ` · bon ${euro(bon.total)}` : ''} · gelezen {euro(sum)}{bon.total && Math.abs(bon.total - sum) < 0.02 ? ' ✓' : ''}</span>
                  </div>
                  {bon.rows.length === 0 && <p className="warn small">Geen producten gevonden op deze foto. Fotografeer de bon recht van boven, plat en met goed licht.</p>}
                  <ul className="ingredients">
                    {bon.rows.map((r, j) => (
                      <li key={j} className={r.on ? 'on' : ''}>
                        <button className={'check' + (r.on ? ' on' : '')} onClick={() => update(b, j, { on: !r.on })}>{r.on ? '✓' : ''}</button>
                        <div className="info">
                          <input className="name plain" value={r.name} onChange={(e) => update(b, j, { name: e.target.value })} />
                          <div className="muted small">{r.line.raw}{r.line.discount ? ` · met korting ${euro(netUnitPrice(r.line))} p/st (normale prijs bewaard)` : ''}</div>
                        </div>
                        <input className="bon-price" inputMode="decimal" value={r.price} onChange={(e) => update(b, j, { price: e.target.value })} />
                      </li>
                    ))}
                  </ul>
                  <button className="link small" onClick={() => setShowRaw(showRaw === b ? null : b)}>{showRaw === b ? 'Verberg' : 'Toon'} gelezen tekst</button>
                  {showRaw === b && <pre className="raw">{bon.raw}</pre>}
                </div>
              );
            })}
            <button className="primary big" disabled={busy} onClick={save}>
              {busy ? 'Opslaan…' : `${bons.reduce((t, b) => t + b.rows.filter((r) => r.on).length, 0)} prijzen opslaan`}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
