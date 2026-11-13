import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/supabase';
import { detectServings, extractIngredients, type ParsedLine } from '../../shared/text';

interface Ingredient { name: string; quantity: number; unit: string; pantry: boolean }
interface Recipe { title: string; servings: number; ingredients: Ingredient[]; raw?: string }

/** Foto verkleinen en als canvas teruggeven. */
async function toCanvas(file: File, max: number): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

/** Optioneel: AI (alleen als er een API-sleutel is ingesteld). Geeft null als dat niet zo is. */
async function readWithAI(file: File): Promise<Recipe | null> {
  const image = (await toCanvas(file, 1600)).toDataURL('image/jpeg', 0.85).split(',')[1];
  try {
    const r = await api<Recipe & { is_recipe: boolean }>('/api/recipe', { image, mediaType: 'image/jpeg' });
    return r.is_recipe ? r : { title: 'Recept', servings: 4, ingredients: [] };
  } catch (e: any) {
    if (e.status === 501 || e.status === 404) return null;
    throw e;
  }
}

/** Gratis: tekst lezen op de telefoon zelf (Tesseract, Nederlands). */
async function readOnDevice(file: File, onProgress: (p: number) => void): Promise<Recipe> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('nld', 1, {
    logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') onProgress(m.progress); },
  });
  try {
    const canvas = await toCanvas(file, 2400);
    const { data } = await worker.recognize(canvas);
    const text = data.text ?? '';
    const ingredients = extractIngredients(text).map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit ?? '', pantry: i.pantry }));
    const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 3 && /[a-z]/i.test(l)) ?? 'Recept';
    return { title: firstLine.slice(0, 40), servings: detectServings(text) ?? 4, ingredients, raw: text };
  } finally {
    await worker.terminate();
  }
}

export default function RecipeSheet({ file, onClose, onAdd }: {
  file: File; onClose: () => void; onAdd: (lines: ParsedLine[], title: string) => Promise<void>;
}) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [err, setErr] = useState('');
  const [progress, setProgress] = useState(0);
  const [persons, setPersons] = useState(4);
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [showRaw, setShowRaw] = useState(false);
  const preview = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = (await readWithAI(file).catch(() => null)) ?? (await readOnDevice(file, (p) => !cancelled && setProgress(p)));
        if (cancelled) return;
        setRecipe(r);
        setPersons(r.servings || 4);
        setPicked(Object.fromEntries(r.ingredients.map((x, i) => [i, !x.pantry])));
        if (!r.ingredients.length) setErr('Ik kon geen ingrediënten vinden. Tip: fotografeer alleen het ingrediëntenlijstje, recht van boven en met goed licht.');
      } catch (e: any) {
        if (!cancelled) setErr(e.message ?? String(e));
      }
    })();
    return () => { cancelled = true; URL.revokeObjectURL(preview); };
  }, [file]);

  const factor = recipe ? persons / (recipe.servings || 4) : 1;
  const scaled = (x: Ingredient) => {
    const q = x.quantity * factor;
    if (!x.unit || ['st', 'blik', 'pak', 'bos', 'teen', 'zak', 'fles'].includes(x.unit)) return Math.max(1, Math.ceil(q - 0.01));
    return Math.round(q * 10) / 10;
  };
  const edit = (i: number, name: string) => recipe && setRecipe({ ...recipe, ingredients: recipe.ingredients.map((x, j) => (j === i ? { ...x, name } : x)) });

  // Via een portal, zodat de onderbalk er niet overheen valt.
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{recipe ? recipe.title : 'Recept lezen…'}</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        {!recipe && !err && (
          <div className="reading">
            <img src={preview} alt="" />
            <div><span className="spinner" /> Tekst lezen… {progress > 0 && `${Math.round(progress * 100)}%`}</div>
            <p className="muted small">De eerste keer duurt dit wat langer (taalbestand downloaden).</p>
          </div>
        )}
        {err && <p className="error">{err}</p>}
        {recipe && recipe.ingredients.length > 0 && (
          <>
            <div className="persons">
              Voor
              <button className="icon-btn" onClick={() => setPersons(Math.max(1, persons - 1))}>−</button>
              <strong>{persons}</strong>
              <button className="icon-btn" onClick={() => setPersons(persons + 1)}>+</button>
              personen <span className="muted small">(recept: {recipe.servings})</span>
            </div>
            <p className="muted small">Tik om aan/uit te zetten. Naam niet goed gelezen? Pas hem aan.</p>
            <ul className="ingredients">
              {recipe.ingredients.map((x, i) => (
                <li key={i} className={picked[i] ? 'on' : ''}>
                  <button className={'check' + (picked[i] ? ' on' : '')} onClick={() => setPicked({ ...picked, [i]: !picked[i] })}>{picked[i] ? '✓' : ''}</button>
                  <input className="name plain" value={x.name} onChange={(e) => edit(i, e.target.value)} />
                  <span className="muted">{scaled(x)} {x.unit}</span>
                  {x.pantry && <span className="tag">heb je vast al</span>}
                </li>
              ))}
            </ul>
            <button className="primary big" onClick={() => onAdd(
              recipe.ingredients.filter((x, i) => picked[i] && x.name.trim()).map((x) => ({ name: x.name.trim(), quantity: scaled(x), unit: x.unit || undefined })),
              recipe.title,
            )}>
              {Object.values(picked).filter(Boolean).length} op de lijst zetten
            </button>
          </>
        )}
        {recipe?.raw && (
          <p className="small"><button className="link" onClick={() => setShowRaw(!showRaw)}>{showRaw ? 'Verberg' : 'Toon'} gelezen tekst</button></p>
        )}
        {showRaw && <pre className="raw">{recipe?.raw}</pre>}
      </div>
    </div>,
    document.body,
  );
}
