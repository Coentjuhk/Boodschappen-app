import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { readReceipts } from '../lib/ocr';
import { looselyMatches, wordsOf } from '../../shared/match';
import type { Item, Store } from '../lib/types';
import { checkReceipt, netUnitPrice, type Receipt, type ReceiptLine } from '../../shared/receipt';
import { euro } from '../../shared/text';

interface Row { line: ReceiptLine; name: string; price: string; on: boolean }
interface Bon { storeId: string; rows: Row[]; receipt: Receipt; raw: string }

/** Naam op de bon ("HALFV MELK") koppelen aan een product op jullie lijst ("Halfvolle melk"), als dat lukt. */
function matchItem(receiptName: string, items: Item[]): string | null {
  const hits = [...new Set(items.map((i) => i.name))].filter((name) => looselyMatches(name, receiptName));
  if (!hits.length) return null;
  // Meerdere kandidaten ("Melk" en "Halfvolle melk")? Dan de meest specifieke.
  return hits.sort((a, b) => wordsOf(b).length - wordsOf(a).length)[0];
}

export default function ReceiptSheet({ files, stores, items, onSave, onClose }: {
  files: File[];
  stores: Store[];
  items: Item[];
  onSave: (storeId: string, entries: { name: string; price: number; title: string }[]) => Promise<void>;
  onClose: () => void;
}) {
  const [bons, setBons] = useState<Bon[] | null>(null);
  const [progress, setProgress] = useState<[number, number, number]>([0, 0, 0]);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRaw, setShowRaw] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const read = await readReceipts(files, (i, p, pass) => !cancelled && setProgress([i, p, pass]));
        if (cancelled) return;
        setBons(read.map(({ receipt: r, text }) => {
          // Winkel van de bon: fysieke winkel van die keten (niet de bezorgdienst), anders de eerste
          const store =
            stores.find((s) => s.enabled && r.chain && s.chain === r.chain && !s.online) ??
            stores.find((s) => r.chain && s.chain === r.chain) ??
            stores.find((s) => s.chain === 'lidl') ??
            stores[0];
          return {
            storeId: store?.id ?? '',
            receipt: r,
            raw: text,
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
          .map((r) => ({ name: r.name.trim(), price: Number(r.price.replace(',', '.')), title: r.line.perKg ? `${r.line.name} (per kilo)` : r.line.name }))
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
            <div><span className="spinner" /> Bon {progress[0] + 1} van {files.length} {progress[2] ? 'nog eens nauwkeurig lezen' : 'lezen'}… {Math.round(progress[1] * 100)}%</div>
            <p className="muted small">De eerste keer duurt dit wat langer (taalbestand downloaden). Klopt een bon niet met zijn eigen totaal, dan leest de app hem nog een keer.</p>
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
            <p className="muted small">De app bewaart de gewone prijs per stuk (bij gewogen producten per kilo). Namen die op je lijst voorkomen zijn al gekoppeld; een prijs telt later ook mee als de naam bijna gelijk is. Tik ✓ uit voor regels die niet kloppen.</p>
            {bons.map((bon, b) => {
              // Ter controle: kloppen de regels met het totaal (en de totale besparing) op de bon zelf?
              const check = checkReceipt(bon.receipt);
              const doubts = bon.rows.filter((r) => r.line.unsure).length;
              return (
                <div key={b} className="bon">
                  <div className="bon-head">
                    <select value={bon.storeId} onChange={(e) => setBons(bons.map((x, i) => (i === b ? { ...x, storeId: e.target.value } : x)))}>
                      {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <span className="muted small">
                      {bon.rows.length} regels{bon.receipt.total != null ? ` · bon ${euro(bon.receipt.total)}` : ''}
                      {check?.ok && <span className="save"> · ✓ klopt met het totaal van de bon</span>}
                    </span>
                  </div>
                  {bon.rows.length > 0 && check && !check.ok && (
                    <p className="warn small">De gelezen regels wijken {euro(Math.abs(check.expected - check.got))} af van het totaal op de bon. Er is dus nog iets verkeerd gelezen: loop de prijzen even na{doubts ? `, vooral de ${doubts === 1 ? 'regel' : `${doubts} regels`} met ⚠️` : ''}.</p>
                  )}
                  {bon.rows.length === 0 && <p className="warn small">Geen producten gevonden op deze foto. De gedeelde bon uit de Lidl Plus-app of een schermafdruk werkt het best; een foto maak je recht van boven, plat en met goed licht.</p>}
                  <ul className="ingredients">
                    {bon.rows.map((r, j) => (
                      <li key={j} className={r.on ? 'on' : ''}>
                        <button className={'check' + (r.on ? ' on' : '')} onClick={() => update(b, j, { on: !r.on })}>{r.on ? '✓' : ''}</button>
                        <div className="info">
                          <input className="name plain" value={r.name} onChange={(e) => update(b, j, { name: e.target.value })} />
                          <div className="muted small">
                            {r.line.unsure ? '⚠️ ' : ''}{r.line.perKg ? 'per kilo · ' : r.line.quantity > 1 ? `${r.line.quantity} stuks · ` : ''}{r.line.raw}
                            {r.line.discount ? ` · met korting ${euro(netUnitPrice(r.line))}${r.line.perKg ? '' : ' p/st'} (gewone prijs bewaard)` : ''}
                          </div>
                          {r.line.alt != null && !r.line.perKg && (
                            <button className="link small alt-price" onClick={() => update(b, j, { price: (r.line.alt! / r.line.quantity).toFixed(2).replace('.', ',') })}>
                              Of is het {euro(r.line.alt / r.line.quantity)}? Tik om over te nemen
                            </button>
                          )}
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
