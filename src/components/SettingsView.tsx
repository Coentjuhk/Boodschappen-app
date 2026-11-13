import { useState } from 'react';
import type { Household, Settings, Store } from '../lib/types';
import type { useLiveData } from '../lib/useHousehold';
import { getMyName, setMyName } from '../lib/useHousehold';
import type { StoreKind } from '../../shared/catalog';
import { AUTO_PRICE_CHAINS } from '../../shared/catalog';
import { euro } from '../../shared/text';

type Data = ReturnType<typeof useLiveData>;
const KINDS: StoreKind[] = ['supermarkt', 'drogist', 'slager', 'bakker', 'bouwmarkt', 'dierenwinkel', 'primera', 'slijterij', 'overig'];

export default function SettingsView({ household, data, saveSettings }: {
  household: Household; data: Data; saveSettings: (p: Partial<Settings>) => void;
}) {
  const link = `${location.origin}/?code=${household.join_code}`;
  const [copied, setCopied] = useState(false);
  const [edit, setEdit] = useState<Partial<Store> | null>(null);
  const [me, setMe] = useState(getMyName());
  const penalty = household.settings.extraStorePenalty ?? 1.5;

  const share = async () => {
    const text = `Doe mee met onze boodschappenlijst: ${link}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Boodschappen', text, url: link });
      else { await navigator.clipboard.writeText(link); setCopied(true); }
    } catch { /* geannuleerd */ }
  };

  return (
    <div className="settings">
      <header className="top"><h1>Winkels & delen</h1></header>

      <section className="card">
        <h2>Samen één lijst</h2>
        <p>Laat je partner deze link openen (of de code invullen). Daarna zien jullie elkaars wijzigingen direct.</p>
        <div className="code">{household.join_code}</div>
        <button className="primary big" onClick={share}>{copied ? 'Link gekopieerd ✓' : 'Deel uitnodiging'}</button>
        <label className="field">
          <span>Mijn naam (zichtbaar bij "toegevoegd door")</span>
          <input value={me} onChange={(e) => setMe(e.target.value)} onBlur={() => setMyName(me.trim())} />
        </label>
      </section>

      <section className="card">
        <h2>Op je beginscherm zetten</h2>
        <p className="small"><strong>iPhone (Safari):</strong> deel-knop <span aria-hidden>⎋</span> → "Zet op beginscherm".</p>
        <p className="small"><strong>Android (Chrome):</strong> menu ⋮ → "App installeren" of "Toevoegen aan startscherm".</p>
      </section>

      <section className="card">
        <h2>Is een extra winkel het waard?</h2>
        <p className="small">Bij "Goedkoopst" stuurt de app je pas naar een extra winkel als je daar minstens <strong>{euro(penalty)}</strong> mee bespaart.</p>
        <input type="range" min={0} max={10} step={0.5} value={penalty} onChange={(e) => saveSettings({ extraStorePenalty: Number(e.target.value) })} />
        <div className="muted small range-labels"><span>€0 (altijd goedkoopst)</span><span>€10</span></div>
      </section>

      <section className="card">
        <h2>Winkels</h2>
        <p className="muted small">Automatische prijzen en aanbiedingen: {AUTO_PRICE_CHAINS.map((c) => c.toUpperCase()).join(', ')}. Bij andere winkels kun je per product zelf een prijs invullen.</p>
        <ul className="stores">
          {data.stores.map((s) => (
            <li key={s.id}>
              <label className="switch">
                <input type="checkbox" checked={s.enabled} onChange={(e) => data.saveStore({ id: s.id, enabled: e.target.checked })} />
                <span />
              </label>
              <div className="info" onClick={() => setEdit(s)}>
                <div>{s.name} {s.chain && (AUTO_PRICE_CHAINS as readonly string[]).includes(s.chain) && <span className="tag green">prijzen</span>}{s.online && <span className="tag">online</span>}</div>
                <div className="muted small">{[s.location, s.kinds.join(', '), s.online ? `bezorgen ${euro(Number(s.delivery_fee))}, min. ${euro(Number(s.min_order))}` : ''].filter(Boolean).join(' · ')}</div>
              </div>
              <button className="link" onClick={() => setEdit(s)}>Wijzig</button>
            </li>
          ))}
        </ul>
        <button className="secondary" onClick={() => setEdit({ name: '', kinds: ['overig'], online: false, delivery_fee: 0, min_order: 0, enabled: true })}>+ Winkel toevoegen</button>
      </section>

      {edit && (
        <div className="sheet-backdrop" onClick={() => setEdit(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head"><h2>{edit.id ? 'Winkel wijzigen' : 'Nieuwe winkel'}</h2><button className="icon-btn" onClick={() => setEdit(null)}>✕</button></div>
            <label className="field"><span>Naam</span><input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="bv. Slagerij Van Dijk" /></label>
            <label className="field"><span>Waar</span><input value={edit.location ?? ''} onChange={(e) => setEdit({ ...edit, location: e.target.value })} placeholder="bv. De Bas, centrum" /></label>
            <label className="field"><span>Prijzen ophalen van keten</span>
              <select value={edit.chain ?? ''} onChange={(e) => setEdit({ ...edit, chain: e.target.value || null })}>
                <option value="">Geen (prijzen zelf invullen)</option>
                {AUTO_PRICE_CHAINS.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
            </label>
            <div className="field"><span>Wat verkopen ze?</span>
              <div className="chips">
                {KINDS.map((k) => (
                  <button key={k} className={'chip' + (edit.kinds?.includes(k) ? ' on' : '')}
                    onClick={() => setEdit({ ...edit, kinds: edit.kinds?.includes(k) ? edit.kinds.filter((x) => x !== k) : [...(edit.kinds ?? []), k] })}>{k}</button>
                ))}
              </div>
            </div>
            <label className="field row-field"><input type="checkbox" checked={!!edit.online} onChange={(e) => setEdit({ ...edit, online: e.target.checked })} /> <span>Online bestellen / bezorgen</span></label>
            {edit.online && (
              <div className="form-grid">
                <label>Bezorgkosten €<input inputMode="decimal" value={String(edit.delivery_fee ?? 0)} onChange={(e) => setEdit({ ...edit, delivery_fee: Number(e.target.value.replace(',', '.')) || 0 })} /></label>
                <label>Minimaal bedrag €<input inputMode="decimal" value={String(edit.min_order ?? 0)} onChange={(e) => setEdit({ ...edit, min_order: Number(e.target.value.replace(',', '.')) || 0 })} /></label>
              </div>
            )}
            <div className="sheet-actions">
              {edit.id ? <button className="link danger" onClick={() => { data.deleteStore(edit.id!); setEdit(null); }}>Verwijderen</button> : <span />}
              <button className="primary" disabled={!edit.name?.trim()} onClick={() => {
                const { household_id: _h, ...rest } = edit as Store;
                data.saveStore({ ...rest, name: edit.name!.trim() });
                setEdit(null);
              }}>Opslaan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
