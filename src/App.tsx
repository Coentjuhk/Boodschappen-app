import { useState } from 'react';
import { configured } from './lib/supabase';
import { getMyName, useHousehold, useLiveData, useSession } from './lib/useHousehold';
import Onboarding from './components/Onboarding';
import ListView from './components/ListView';
import SettingsView from './components/SettingsView';

export default function App() {
  const { userId, error } = useSession();
  const hh = useHousehold(userId);
  const data = useLiveData(hh.household?.id);
  const [tab, setTab] = useState<'list' | 'settings'>('list');

  if (!configured) {
    return (
      <div className="center-page">
        <h1>Bijna klaar</h1>
        <p>De app is nog niet gekoppeld aan de database. Zet <code>VITE_SUPABASE_URL</code> en <code>VITE_SUPABASE_ANON_KEY</code> in Vercel (zie README).</p>
      </div>
    );
  }
  if (error) return <div className="center-page"><h1>Inloggen mislukt</h1><p>{error}</p></div>;
  if (!userId || hh.loading) return <div className="center-page"><div className="spinner" /></div>;
  if (!hh.household) return <Onboarding onCreate={hh.create} onJoin={hh.join} />;

  return (
    <div className="app">
      <main>
        {tab === 'list' ? (
          <ListView household={hh.household} data={data} saveSettings={hh.saveSettings} me={getMyName()} />
        ) : (
          <SettingsView household={hh.household} data={data} saveSettings={hh.saveSettings} />
        )}
      </main>
      <nav className="tabbar">
        <button className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>🛒<span>Lijst</span></button>
        <button className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>⚙️<span>Winkels & delen</span></button>
      </nav>
    </div>
  );
}
