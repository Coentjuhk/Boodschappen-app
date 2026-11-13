// Browsertest met een nagebootste database (geen echte gegevens nodig).
// Gebruik:  npx vite build --outDir /tmp/bs-demo   (met VITE_SUPABASE_URL=https://demo.supabase.co VITE_SUPABASE_ANON_KEY=demo)
//           node tests/e2e/app.e2e.cjs /tmp/bs-demo [map-voor-screenshots]
// Vereist Playwright (niet in package.json; `npm i -D playwright` of een globale installatie).
const { chromium, devices } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const [root, shots] = process.argv.slice(2);
const PORT = 4180;
const H = 'hh1';
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((q, r) => {
  let f = path.join(root, q.url.split('?')[0]);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html');
  r.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream');
  r.end(fs.readFileSync(f));
}).listen(PORT);

// ---------- nagebootste database ----------
const now = new Date().toISOString();
const store = (id, name, chain, sort, extra = {}) => ({ id, household_id: H, name, chain, kinds: ['supermarkt'], location: null, online: false, delivery_fee: 0, min_order: 0, enabled: true, sort, ...extra });
const item = (id, name, category, extra = {}) => ({ id, household_id: H, name, quantity: 1, unit: null, note: null, category, store_id: null, pinned: null, checked: false, wait_offer: false, target_price: null, added_by: 'Coen', source: null, created_at: now, updated_at: now, ...extra });
const price = (chain, query, id, title, p, extra = {}) => ({ id, household_id: null, chain, store_id: null, query, product_id: id, title, size: null, price: p, base_price: p, mechanic: null, offer_from: null, offer_until: null, online_only: false, image_url: null, url: null, rank: 0, match: 0, fetched_at: now, ...extra });
const db = {
  household: { id: H, name: 'Ons huishouden', join_code: 'K7Q2PA', settings: {} },
  stores: [store('s-ah', "Albert Heijn 't Plateau", 'ah', 0), store('s-lidl', "Lidl 't Plateau", 'lidl', 1), store('s-slager', 'Slager', null, 2, { kinds: ['slager'] })],
  items: [item('i-brood', 'Brood', 'brood'), item('i-melk', 'Melk', 'zuivel'), item('i-knak', 'Knakworsten', 'vlees', { wait_offer: true }), item('i-scheer', 'Scheermesjes', 'verzorging', { wait_offer: true })],
  prices: [
    price('ah', 'melk', 'ah-melk-1', 'AH Halfvolle melk', 1.29, { size: '1 l', rank: 0 }),
    price('ah', 'melk', 'ah-melk-2', 'AH Volle melk', 1.39, { size: '1 l', rank: 1 }),
    price('ah', 'brood', 'ah-brood', 'AH Volkoren brood', 1.89),
    price('ah', 'knakworsten', 'ah-knak', 'Unox Knaks', 2.89, { mechanic: '2 voor 4.99', offer_from: '2000-01-01', offer_until: '2999-01-01' }),
    price('ah', 'scheermesjes', 'ah-scheer', 'Gillette scheermesjes', 17.99, { mechanic: '2e halve prijs', offer_from: '2999-01-01', offer_until: '2999-01-07' }),
    { ...price(null, 'melk', 'own-1', 'Halfv melk 1l', 0.99), household_id: H, store_id: 's-lidl', product_id: 'handmatig', query: 'halfv melk 1l', match: null },
  ],
  log: [],
};
let offline = false;

const json = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
async function supabase(route) {
  if (offline) return route.abort('internetdisconnected');
  const req = route.request();
  const u = new URL(req.url());
  const m = req.method();
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  const eq = (k) => (u.searchParams.get(k) || '').replace(/^eq\./, '');
  if (u.pathname.startsWith('/auth/v1/')) {
    return json(route, { access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', role: 'authenticated' } });
  }
  const table = u.pathname.split('/').pop();
  db.log.push(`${m} ${table}`);
  if (table === 'members') return json(route, db.household ? [{ created_at: now, households: db.household }] : []);
  if (table === 'join_household') {
    if (body.p_code !== 'K7Q2PA') return json(route, { message: 'Onbekende code', code: 'P0001' }, 400);
    return json(route, db.household);
  }
  if (table === 'households') {
    if (m === 'PATCH') { Object.assign(db.household, body); return json(route, null, 204); }
    return json(route, { settings: db.household.settings });
  }
  if (table === 'stores') return json(route, db.stores);
  if (table === 'prices') {
    if (m !== 'GET') return json(route, null, 204);
    if (eq('household_id') === H) return json(route, db.prices.filter((p) => p.household_id === H));
    const list = decodeURIComponent(u.searchParams.get('query') || '').replace(/^in\.\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, ''));
    return json(route, db.prices.filter((p) => !p.household_id && list.includes(p.query)));
  }
  if (table === 'items') {
    // Net als de echte database: zonder inlogsessie krijg je een lege lijst terug, géén foutmelding.
    if (m === 'GET') return json(route, req.headers()['authorization'] === 'Bearer t' ? db.items : []);
    if (m === 'POST') {
      for (const row of [].concat(body)) {
        if (db.items.some((i) => i.id === row.id)) return json(route, { message: 'duplicate key', code: '23505' }, 409);
        db.items.push({ created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row });
      }
      return json(route, null, 201);
    }
    const id = eq('id');
    if (m === 'PATCH') { const it = db.items.find((i) => i.id === id); if (it) Object.assign(it, body); return json(route, null, 204); }
    if (m === 'DELETE') { db.items = db.items.filter((i) => i.id !== id); return json(route, null, 204); }
  }
  return json(route, []);
}

// ---------- hulpjes ----------
let failures = 0;
const ok = (cond, what) => { console.log(`${cond ? '  ✓' : '  ✗ MISLUKT:'} ${what}`); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const open = async (url = '/') => {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { console.log('  PAGINAFOUT', e.message); failures++; });
    await page.route('https://demo.supabase.co/**', supabase);
    await page.route('**/api/prices', (r) => (offline ? r.abort('internetdisconnected') : json(r, { results: [] })));
    await page.route('**/api/manifest**', (r) => json(r, { name: 'Boodschappen', start_url: '/?code=' + new URL(r.request().url()).searchParams.get('code') }));
    await page.goto(`http://localhost:${PORT}${url}`);
    return { ctx, page };
  };
  // Naam zonder aantal ("2× ") en zonder label ("🎯 wachtlijst")
  const rowNames = (page) => page.$$eval('.group:not(.waiting):not(.done) .row .name', (els) =>
    els.map((e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/^[\d.,]+(×| \S+) /, '').trim()));
  const shot = async (page, name, full = false) => { if (shots) await page.screenshot({ path: path.join(shots, name + '.png'), fullPage: full }); };

  console.log('1. Lijst laden, productkeuze en wachtlijst');
  let { ctx, page } = await open();
  await page.waitForSelector('.row');
  ok((await rowNames(page)).join() === ['Brood', 'Knakworsten', 'Melk'].join(), 'lijst toont Brood, Knakworsten (actie!) en Melk');
  ok(await page.locator('.waiting .row', { hasText: 'Scheermesjes' }).count() === 1, 'Scheermesjes blijft wachten (actie begint later)');
  ok(await page.locator('.waiting .soon').count() === 1, 'aankomende actie wordt aangekondigd');
  ok(await page.locator('.group h2', { hasText: 'Lidl' }).count() === 0, 'Melk blijft bij AH: € 0,30 besparen is geen extra winkel waard');
  ok(await page.evaluate(() => document.querySelector('link[rel=manifest]').getAttribute('href')) === '/api/manifest?code=K7Q2PA', 'beginscherm-icoon krijgt de code van de lijst mee');
  ok(await page.evaluate(() => location.search) === '?code=K7Q2PA', 'adres bevat de code');
  await shot(page, '1-lijst', true);

  console.log('2. Toevoegen en afvinken met verbinding');
  await page.fill('.addbar textarea', 'Kaas');
  await page.click('.addbar button.primary');
  await page.waitForFunction(() => [...document.querySelectorAll('.row .name')].some((e) => e.textContent.includes('Kaas')));
  await sleep(300);
  ok(db.items.some((i) => i.name === 'Kaas' && i.added_by !== undefined), 'Kaas staat op de server');
  await page.click('.row:has-text("Brood") button.check');
  await page.waitForSelector('.toast');
  ok((await page.textContent('.toast')).includes('Afgevinkt: Brood'), 'melding met "Ongedaan maken" verschijnt');
  await page.click('.toast button');
  await sleep(300);
  ok((await rowNames(page)).includes('Brood') && db.items.find((i) => i.id === 'i-brood').checked === false, 'ongedaan maken zet Brood terug (ook op de server)');

  console.log('3. Zonder bereik: afvinken en toevoegen blijven werken');
  offline = true;
  await page.click('.row:has-text("Brood") button.check');
  await page.fill('.addbar textarea', '2x Pindakaas');
  await page.click('.addbar button.primary');
  await page.waitForSelector('.netbar');
  const names = await rowNames(page);
  ok(!names.includes('Brood') && names.includes('Pindakaas'), 'scherm is direct bijgewerkt');
  ok(/2 wijzigingen wachten/.test(await page.textContent('.netbar')), 'balk meldt: geen verbinding, 2 wijzigingen wachten');
  ok(db.items.find((i) => i.id === 'i-brood').checked === false && !db.items.some((i) => i.name === 'Pindakaas'), 'server weet nog van niets');
  await shot(page, '2-offline');

  console.log('4. App opnieuw openen zonder bereik');
  await page.reload();
  await page.waitForSelector('.row');
  const again = await rowNames(page);
  ok(!again.includes('Brood') && again.includes('Pindakaas') && again.includes('Melk'), 'lijst komt van de telefoon, met de wachtende wijzigingen');
  ok(await page.locator('.price', { hasText: '€' }).count() > 0, 'prijzen zijn ook zonder bereik zichtbaar');

  console.log('5. Bereik terug: wachtrij wordt verstuurd');
  offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForSelector('.netbar', { state: 'detached', timeout: 10000 });
  ok(db.items.find((i) => i.id === 'i-brood').checked === true, 'Brood is nu ook op de server afgevinkt');
  ok(db.items.filter((i) => i.name === 'Pindakaas' && Number(i.quantity) === 2).length === 1, 'Pindakaas (2×) staat precies één keer op de server');

  console.log('6. Wissen en ongedaan maken');
  await page.click('.done button.danger');
  await sleep(300);
  ok(!db.items.some((i) => i.id === 'i-brood'), 'afgevinkt product is gewist');
  await page.click('.toast button');
  await sleep(400);
  ok(db.items.some((i) => i.id === 'i-brood' && i.checked), 'ongedaan maken zet het terug');

  console.log('7. Product kiezen en onthouden');
  await page.click('.row:has-text("Melk") .info');
  await page.waitForSelector('.sheet');
  await sleep(400);
  await shot(page, '3-product');
  ok(await page.locator('.product.used', { hasText: 'Halfv melk 1l' }).count() === 1, 'bonprijs van Lidl ("Halfv melk 1l") telt mee voor "Melk"');
  await page.click('.product-main:has-text("AH Volle melk")');
  await sleep(500);
  ok(JSON.stringify(db.items.find((i) => i.id === 'i-melk').pinned) === JSON.stringify({ ah: { product_id: 'ah-melk-2', title: 'AH Volle melk' } }), 'keuze staat bij het product');
  ok(db.household.settings.pins && db.household.settings.pins.melk && db.household.settings.pins.melk.ah.product_id === 'ah-melk-2', 'keuze is onthouden voor het huishouden');
  ok(await page.locator('.product.pinned', { hasText: 'AH Volle melk' }).count() === 1, 'gekozen product is gemarkeerd');
  await page.click('.sheet-head .icon-btn');
  await page.fill('.addbar textarea', 'Melk');
  await page.click('.addbar button.primary');
  await sleep(300);
  ok(db.items.find((i) => i.id === 'i-melk').quantity === 2, 'nog een keer "Melk" hoogt het aantal op');

  console.log('7b. Inlogsessie valt weg (haperend bereik): de lijst mag niet leeg raken');
  const before = (await rowNames(page)).length;
  await page.evaluate(() => { Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)); window.dispatchEvent(new Event('online')); });
  await sleep(1500);
  ok(before > 0 && (await rowNames(page)).length === before, 'lijst blijft staan');
  ok(JSON.parse(await page.evaluate(() => localStorage.getItem('bs.hh1.items'))).length > 0, 'ook de kopie op de telefoon blijft intact');
  await ctx.close();

  console.log('8. Uitnodiging voor een andere lijst');
  ({ ctx, page } = await open('/'));
  await page.waitForSelector('.row');
  await page.goto(`http://localhost:${PORT}/?code=ZZZZ99`);
  await page.waitForSelector('text=Andere lijst openen?');
  await page.click('text=Bij mijn lijst blijven');
  await page.waitForSelector('.row');
  ok(true, 'vraagt om bevestiging en blijft bij de eigen lijst');
  await ctx.close();

  console.log('9. Nieuwe telefoon met code in het adres (iPhone-beginscherm)');
  db.household = null;                       // deze "telefoon" is nog nergens lid van
  ({ ctx, page } = await open('/?code=K7Q2PA'));
  await page.waitForSelector('text=Meedoen met de lijst');
  ok(await page.inputValue('input[placeholder="ABC123"]') === 'K7Q2PA', 'code is al ingevuld; alleen nog je naam');
  ok(await page.evaluate(() => document.querySelector('link[rel=manifest]').getAttribute('href')) === '/api/manifest?code=K7Q2PA', 'beginscherm-icoon heeft de code al');
  db.household = { id: H, name: 'Ons huishouden', join_code: 'K7Q2PA', settings: {} };
  await page.fill('input[autocomplete="given-name"]', 'Jacky');
  await page.click('text=Meedoen met de lijst');
  await page.waitForSelector('.row');
  ok(true, 'na meedoen staat de lijst er');
  await ctx.close();

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} controle(s) mislukt` : '\nAlle controles geslaagd');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
