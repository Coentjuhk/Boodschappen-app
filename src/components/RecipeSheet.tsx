import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/supabase';
import type { ParsedLine } from '../../shared/text';

interface Ingredient { name: string; quantity: number; unit: string; category: string; pantry: boolean }
interface Recipe { is_recipe: boolean; title: string; servings: number; ingredients: Ingredient[] }

/** Foto verkleinen (scheelt uploadtijd en kosten) en als base64 JPEG teruggeven. */
async function shrink(file: File, max = 1600): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}

export default function RecipeSheet({ file, onClose, onAdd }: {
  file: File; onClose: () => void; onAdd: (lines: ParsedLine[], title: string) => Promise<void>;
}) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [err, setErr] = useState('');
  const [persons, setPersons] = useState(4);
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const preview = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const image = await shrink(file);
        const r = await api<Recipe>('/api/recipe', { image, mediaType: 'image/jpeg' });
        if (cancelled) return;
        if (!r.is_recipe || !r.ingredients.length) return setErr('Ik zie geen recept op deze foto. Probeer het nog eens, met de ingrediënten goed in beeld.');
        setRecipe(r);
        setPersons(r.servings || 4);
        setPicked(Object.fromEntries(r.ingredients.map((x, i) => [i, !x.pantry])));
      } catch (e: any) {
        if (!cancelled) setErr(e.message);
      }
    })();
    return () => { cancelled = true; URL.revokeObjectURL(preview); };
  }, [file]);

  const factor = recipe ? persons / (recipe.servings || 4) : 1;
  const scaled = (x: Ingredient) => {
    const q = x.quantity * factor;
    // Stuks/blikken/pakken naar boven afronden; gewicht netjes afronden
    if (!x.unit || ['st', 'blik', 'pak', 'bos', 'teen', 'zak', 'fles'].includes(x.unit)) return Math.max(1, Math.ceil(q - 0.01));
    return Math.round(q * 10) / 10;
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{recipe ? recipe.title : 'Recept lezen…'}</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        {!recipe && !err && (
          <div className="reading">
            <img src={preview} alt="" />
            <div><span className="spinner" /> Ingrediënten zoeken…</div>
          </div>
        )}
        {err && <p className="error">{err}</p>}
        {recipe && (
          <>
            <div className="persons">
              Voor
              <button className="icon-btn" onClick={() => setPersons(Math.max(1, persons - 1))}>−</button>
              <strong>{persons}</strong>
              <button className="icon-btn" onClick={() => setPersons(persons + 1)}>+</button>
              personen <span className="muted small">(recept: {recipe.servings})</span>
            </div>
            <ul className="ingredients">
              {recipe.ingredients.map((x, i) => (
                <li key={i} onClick={() => setPicked({ ...picked, [i]: !picked[i] })} className={picked[i] ? 'on' : ''}>
                  <span className={'check' + (picked[i] ? ' on' : '')}>{picked[i] ? '✓' : ''}</span>
                  <span className="name">{x.name}</span>
                  <span className="muted">{scaled(x)} {x.unit}</span>
                  {x.pantry && <span className="tag">heb je vast al</span>}
                </li>
              ))}
            </ul>
            <button className="primary big" onClick={() => onAdd(
              recipe.ingredients.filter((_, i) => picked[i]).map((x) => ({ name: x.name, quantity: scaled(x), unit: x.unit || undefined })),
              recipe.title,
            )}>
              {Object.values(picked).filter(Boolean).length} op de lijst zetten
            </button>
          </>
        )}
      </div>
    </div>
  );
}
