import { it } from 'vitest';
// Alleen met LIVE=1: test de echte winkelbronnen.
import { searchAH, searchJumbo } from '../api/_lib/sources';
it.skipIf(!process.env.LIVE)('live', async () => {
  for (const q of ['pasta', 'halfvolle melk', 'kattenvoer']) {
    for (const [n, f] of [['ah', searchAH], ['jumbo', searchJumbo]] as const) {
      try { const r = await f(q); console.log(n, q, r.length, r.slice(0, 2).map((x) => `${x.title} €${x.price} ${x.mechanic ?? ''} ${x.offer_until ?? ''}`)); }
      catch (e: any) { console.log(n, q, 'FOUT', e.message); }
    }
  }
}, 60000);
