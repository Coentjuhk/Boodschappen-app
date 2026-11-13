import { useRef, useState } from 'react';
import { parseList, type ParsedLine } from '../../shared/text';
import RecipeSheet from './RecipeSheet';

/** Eén regel typen, of een hele lijst plakken (elke regel wordt een product). Plus: foto van een recept. */
export default function AddBar({ onAdd }: { onAdd: (lines: ParsedLine[], source?: string) => Promise<void> | void }) {
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lines = parseList(text);

  const submit = async () => {
    if (!lines.length) return;
    setText('');
    await onAdd(lines, lines.length > 1 ? 'geplakt' : undefined);
  };

  return (
    <div className="addbar">
      <div className="addrow">
        <textarea
          rows={text.includes('\n') ? Math.min(8, text.split('\n').length) : 1}
          value={text}
          placeholder="Toevoegen of lijst plakken…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !text.includes('\n')) { e.preventDefault(); submit(); }
          }}
        />
        {text.trim() ? (
          <button className="primary" onClick={submit}>{lines.length > 1 ? `+${lines.length}` : 'Voeg toe'}</button>
        ) : (
          <button className="secondary" title="Foto van recept" onClick={() => fileRef.current?.click()}>📷 Recept</button>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhoto(f); e.target.value = ''; }} />
      </div>
      {lines.length > 1 && (
        <div className="preview muted small">{lines.map((l) => `${l.quantity !== 1 ? l.quantity + (l.unit ? ' ' + l.unit : '×') + ' ' : ''}${l.name}`).join(' · ')}</div>
      )}
      {photo && <RecipeSheet file={photo} onClose={() => setPhoto(null)} onAdd={async (ls, title) => { await onAdd(ls, 'recept: ' + title); setPhoto(null); }} />}
    </div>
  );
}
