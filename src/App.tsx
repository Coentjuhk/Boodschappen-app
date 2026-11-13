import { useEffect, useState } from 'react';
import { configured } from './lib/supabase';
import { declineCode, declinedCodes, getMyName, useHousehold, useLiveData, useSession } from './lib/useHousehold';
import { usePrefs } from './lib/prefs';
import type { Household } from './lib/types';
import Onboarding from './components/Onboarding';
import ListView from './components/ListView';
import SettingsView from './components/SettingsView';

const urlCode = () => {
  const c = new URLSearchParams(location.search).get('code')?.trim().toUpperCase();
  return c && /^[A-Z0-9]{4,12}$/.test(c) ? c : null;
};

export default function App() {
  const session = useSession();
  const hh = useHousehold(session.userId);

  if (!configured) {
    return (
      <div className="center-page">
        <h1>Bijna klaar</h1>
        <p>De app is nog niet gekoppeld aan de database. Koppel Supabase aan het project in Vercel (Storage → Supabase) en deploy opnieuw. Zie de README.</p>
      </div>
    );
  }
  // Staat de lijst al op deze telefoon? Dan meteen tonen, ook als er (nog) geen verbinding is.
  if (hh.household) return <Main key={hh.household.id} household={hh.household} hh={hh} />;

  if (session.error) {
    return (
      <div className="center-page">
        <h1>{session.error === 'Geen verbinding' ? 'Geen verbinding' : 'Inloggen mislukt'}</h1>
        <p className="muted">{session.error === 'Geen verbinding' ? 'De app heeft de eerste keer internet nodig.' : session.error}</p>
        <button className="primary big" onClick={() => session.retry()}>Opnieuw proberen</button>
      </div>
    );
  }
  if (!session.userId || hh.loading) return <div className="center-page"><div className="spinner" /></div>;
  if (hh.setupError) return <div className="center-page"><h1>Bijna klaar</h1><p>{hh.setupError}</p></div>;
  return <Onboarding onCreate={hh.create} onJoin={hh.join} />;
}

function Main({ household, hh }: { household: Household; hh: ReturnType<typeof useHousehold> }) {
  const data = useLiveData(household.id);
  const { prefs, savePrefs } = usePrefs(household);
  const [tab, setTab] = useState<'list' | 'settings'>('list');
  const [busy, setBusy] = useState(false);
  // Geopend via een uitnodiging voor een ándere lijst?
  const [invite, setInvite] = useState(() => {
    const c = urlCode();
    return c && c !== household.join_code.toUpperCase() && !declinedCodes().includes(c) ? c : null;
  });

  // De code van de lijst hoort bij het beginscherm-icoon: op de iPhone heeft de app op je beginscherm
  // een eigen geheugen, en zo komt hij toch bij dezelfde lijst uit.
  useEffect(() => {
    if (invite) return;
    const code = household.join_code.toUpperCase();
    document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.setAttribute('href', `/api/manifest?code=${code}`);
    if (urlCode() !== code) history.replaceState(null, '', `/?code=${code}`);
  }, [household.join_code, invite]);

  if (invite) {
    return (
      <div className="center-page">
        <h1>Andere lijst openen?</h1>
        <p>Je opende een uitnodiging voor een andere boodschappenlijst (code <strong>{invite}</strong>). Je gebruikt nu de lijst met code <strong>{household.join_code}</strong>.</p>
        <button className="primary big" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await hh.join(invite, getMyName() || 'Ik'); } catch (e: any) { data.notify(e.message ?? String(e)); setInvite(null); } finally { setBusy(false); }
        }}>Overstappen naar die lijst</button>
        <button className="secondary big" disabled={busy} onClick={() => { declineCode(invite); setInvite(null); }}>Bij mijn lijst blijven</button>
      </div>
    );
  }

  return (
    <div className={'app' + (data.offline ? ' offline' : '')}>
      {data.offline && (
        <div className="netbar" role="status">
          Geen verbinding
          {data.pending ? ` · ${data.pending} ${data.pending === 1 ? 'wijziging wacht' : 'wijzigingen wachten'}` : ' · laatst bekende lijst'}
        </div>
      )}
      <main>
        {tab === 'list' ? (
          <ListView household={household} data={data} prefs={prefs} savePrefs={savePrefs} rememberPins={hh.rememberPins} me={getMyName()} />
        ) : (
          <SettingsView household={household} data={data} prefs={prefs} savePrefs={savePrefs} onJoin={hh.join} />
        )}
      </main>
      {data.notice && (
        <div className="toast" role="status">
          <span>{data.notice.text}</span>
          {data.notice.action && (
            <button onClick={() => { data.notice!.action!.run(); data.dismissNotice(); }}>{data.notice.action.label}</button>
          )}
        </div>
      )}
      <nav className="tabbar">
        <button className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>🛒<span>Lijst</span></button>
        <button className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>⚙️<span>Winkels & delen</span></button>
      </nav>
    </div>
  );
}
