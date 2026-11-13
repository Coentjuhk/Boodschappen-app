import { describe, expect, it } from 'vitest';
import { applyOps, classify, enqueue, type Op } from '../src/lib/outbox';
import type { Item } from '../src/lib/types';

const item = (id: string, extra: Partial<Item> = {}): Item =>
  ({ id, household_id: 'h', name: id, quantity: 1, unit: null, note: null, category: 'overig', store_id: null, pinned: null, checked: false, wait_offer: false, target_price: null, added_by: null, source: null, created_at: '', updated_at: '', ...extra });

describe('wachtrij voor wijzigingen', () => {
  it('past wijzigingen toe op de stand van de server', () => {
    const ops: Op[] = [
      { t: 'insert', row: item('melk') },
      { t: 'update', id: 'brood', patch: { checked: true } },
      { t: 'delete', id: 'kaas' },
    ];
    const view = applyOps([item('brood'), item('kaas')], ops);
    expect(view.map((i) => i.id)).toEqual(['brood', 'melk']);
    expect(view[0].checked).toBe(true);
  });
  it('voegt een product niet dubbel toe als de server het al heeft', () => {
    expect(applyOps([item('melk', { quantity: 2 })], [{ t: 'insert', row: item('melk') }])).toHaveLength(1);
  });
  it('wissen en daarna ongedaan maken zet het product terug', () => {
    const view = applyOps([item('melk', { checked: true })], [{ t: 'delete', id: 'melk' }, { t: 'insert', row: item('melk', { checked: true }) }]);
    expect(view).toHaveLength(1);
  });
  it('voegt opeenvolgende aanpassingen samen', () => {
    let q: Op[] = [{ t: 'delete', id: 'x' }];
    q = enqueue(q, { t: 'update', id: 'melk', patch: { quantity: 2 } }, false);
    q = enqueue(q, { t: 'update', id: 'melk', patch: { quantity: 3 } }, false);
    q = enqueue(q, { t: 'update', id: 'melk', patch: { checked: true } }, false);
    expect(q).toEqual([{ t: 'delete', id: 'x' }, { t: 'update', id: 'melk', patch: { quantity: 3, checked: true } }]);
  });
  it('voegt niet samen met een wijziging die net onderweg is', () => {
    const q = enqueue([{ t: 'update', id: 'melk', patch: { quantity: 2 } }], { t: 'update', id: 'melk', patch: { quantity: 3 } }, true);
    expect(q).toHaveLength(2);
  });
  it('herkent wat later opnieuw moet en wat echt fout is', () => {
    expect(classify({ error: null, status: 201 })).toBe('ok');
    expect(classify({ error: { message: 'TypeError: Failed to fetch' }, status: 0 })).toBe('later');
    expect(classify({ error: { message: 'TypeError: Load failed' }, status: 0 })).toBe('later'); // Safari
    expect(classify({ error: { message: 'bad gateway' }, status: 502 })).toBe('later');
    expect(classify({ error: { message: 'JWT expired' }, status: 401 })).toBe('later');
    expect(classify({ error: { message: 'duplicate key', code: '23505' }, status: 409 })).toBe('ok');
    expect(classify({ error: { message: 'invalid input syntax' }, status: 400 })).toEqual({ error: 'invalid input syntax' });
  });
});
