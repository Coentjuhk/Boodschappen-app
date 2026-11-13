import { it } from 'vitest';
import { searchAH, searchJumbo } from '../api/_lib/sources';

// Alleen met LIVE=1: test de echte winkelbronnen (AH en Jumbo). Handig als prijzen ineens ontbreken.
//   LIVE=1 npx vitest run tests/live.test.ts --silent=false
it.skipIf(!process.env.LIVE)('live', async () => {
  for (const q of ['pasta', 'halfvolle melk', 'knakworsten', 'scheermesjes', 'wc papier']) {
    for (const [n, f] of [['ah', searchAH], ['jumbo', searchJumbo]] as const) {
      try {
        const r = await f(q);
        console.log(n, `"${q}"`, r.length, r.slice(0, 3).map((x) => `[${x.match}] ${x.title} €${x.price}${x.mechanic ? ` (${x.mechanic} ${x.offer_from ?? ''}→${x.offer_until ?? ''})` : ''}`));
      } catch (e: any) {
        console.log(n, `"${q}"`, 'FOUT', e.message);
      }
    }
  }
}, 90000);
