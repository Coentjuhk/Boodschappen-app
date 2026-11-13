import { useState } from 'react';
import { getMyName, setMyName } from '../lib/useHousehold';

export default function Onboarding(props: {
  onCreate: (name: string, me: string) => Promise<void>;
  onJoin: (code: string, me: string) => Promise<void>;
}) {
  const [me, setMe] = useState(getMyName());
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('code') ?? '');
  const [joining, setJoining] = useState(!!code);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (fn: () => Promise<void>) => {
    if (!me.trim()) return setErr('Vul eerst je naam in');
    setBusy(true); setErr('');
    setMyName(me.trim());
    try { await fn(); } catch (e: any) { setErr(e.message ?? String(e)); } finally { setBusy(false); }
  };

  return (
    <div className="center-page onboarding">
      <img src="/icon.svg" alt="" width={72} height={72} />
      <h1>Boodschappen</h1>
      <p className="muted">Eén lijst voor jullie samen, met prijzen en aanbiedingen.</p>
      <label className="field">
        <span>Jouw naam</span>
        <input value={me} onChange={(e) => setMe(e.target.value)} placeholder="bv. Coen" autoComplete="given-name" />
      </label>

      {joining ? (
        <>
          <label className="field">
            <span>Code van het huishouden</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" />
          </label>
          <button className="primary big" disabled={busy} onClick={() => run(() => props.onJoin(code, me))}>Meedoen met de lijst</button>
          <button className="link" onClick={() => setJoining(false)}>Ik wil een nieuwe lijst beginnen</button>
        </>
      ) : (
        <>
          <button className="primary big" disabled={busy} onClick={() => run(() => props.onCreate('Ons huishouden', me))}>Nieuwe gedeelde lijst starten</button>
          <button className="secondary big" disabled={busy} onClick={() => setJoining(true)}>Ik heb een code gekregen</button>
        </>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  );
}
