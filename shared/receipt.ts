// Kassabon (foto of schermafdruk, na tekstherkenning) omzetten in producten met prijzen.
// Getest op echte digitale bonnen uit de Lidl Plus-app; werkt ook voor gewone bonnen van andere winkels.

export interface ReceiptLine {
  raw: string;        // zoals op de bon
  name: string;       // opgeschoond
  price: number;      // gewone prijs per stuk (bij gewogen producten: per kilo)
  quantity: number;
  total: number;      // bedrag van deze regel op de bon (vóór korting)
  discount?: number;  // korting die direct onder deze regel stond (positief bedrag)
  perKg?: boolean;    // gewogen product: `price` is de kiloprijs
  unsure?: boolean;   // even controleren: aantal × prijs klopt niet, of twee lezingen verschillen
  alt?: number;       // regelbedrag volgens de andere lezing (als die afwijkt)
}

export interface Receipt {
  chain: string | null;    // 'lidl', 'ah', 'dirk', 'jumbo', 'aldi', 'plus' of null
  lines: ReceiptLine[];
  total: number | null;    // "Totaal" op de bon
  savings?: number | null; // "Jouw totale besparing is ..." (alle kortingen samen), als dat op de bon staat
}

const CHAINS: [RegExp, string][] = [
  [/\blidl\b|l[i$1!|]dl plus/i, 'lidl'],
  [/albert\s*heijn|\bah\b.*bonus/i, 'ah'],
  [/\bdirk\b|van\s*den\s*broek/i, 'dirk'],
  [/\bjumbo\b/i, 'jumbo'],
  [/\baldi\b/i, 'aldi'],
  [/\bplus\b/i, 'plus'],
  [/kruidvat/i, 'kruidvat'],
];

// Regels die geen product zijn (voor bonnen zonder duidelijke kop en voet)
const SKIP = /\b(subtotaal|betaald|pin|pinnen|contant|wisselgeld|btw|bonus\s*box|bankpas|kaart|maestro|v\s*pay|visa|mastercard|transactie|terminal|autorisatie|kassa|bon\s*nr|filiaal|datum|tijd|bedankt|retour|statiegeld retour|spaarzegels|koopzegels|uw voordeel|totaal voordeel|besparing|bespaard|aantal artikelen|klantenservice|openingstijden|www\.|tel\.?|kvk|btw-nr|omschrijving)\b/i;
// Kortingsregels horen bij het product erboven ("Lidl Plus korting -3,60", "Actieprijs -1,00", "In prijs verlaagd -0,03")
const DISCOUNT = /^(l\S{2,3}\s+p\S{2,3}\b|actie\s*pr|in\s+pr\S{2,4}\s+ver|prijs\s*verl|korting|prijsvoordeel|bonus\b|uw\s+korting)|kort\S{1,3}g\b|kas\S{1,3}bon\b/i;
const END = /^(aantal|totaal|te betalen|totaalbedrag|subtotaal)\b/i;
const QTY = /(\d{1,2})\s*[xX×*]+\s*(\d{1,4})[.,](\d{2})(?!\d)/;                     // "6 x 2,59"
const WEIGHT = /^\D{0,3}(\d{1,2}[.,]\d{1,3})\s*k[gq9]\s*[xX×*]+\s*(\d{1,4})[.,](\d{2})/i; // "1,060 kg x 1,85 EUR/kg"
const AMOUNT = /([-–—~]\s?)?(\d{1,4})[.,](\d{2})(?!\d)/g;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Leesfoutjes aan het eind van de regel herstellen. De btw-letter plakt soms aan de prijs
 * ("1,17 B" → "1,178B", "2,75 B" → "2,758") en een komma wordt soms een dubbele punt ("1:96 B").
 */
function tidyLine(l: string): string {
  return l
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(\d)[:;](\d{2})\s?[A-D8]{0,2}$/, '$1,$2')
    .replace(/(\d[.,]\d{2})(?:8B?|B)$/, '$1')
    .replace(/(\d[.,]\d{2})\s[A-Za-z0-9]{1,2}$/, '$1');   // btw-letter of losse leesruis achter de prijs
}

const tidyName = (s: string) => {
  const t = s.replace(/[*#|_]+/g, ' ').replace(/\s+/g, ' ').replace(/^[^a-zà-ÿ0-9]+|[^a-zà-ÿ0-9.+%)]+$/gi, '').trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Aantal × stukprijs moet het regelbedrag zijn. Klopt dat niet, dan is er één verkeerd gelezen. */
function reconcile(quantity: number, unit: number, total: number): { price: number; total: number; unsure: boolean } {
  if (Math.abs(quantity * unit - total) < 0.015) return { price: unit, total, unsure: false };
  // Komt het regelbedrag precies uit op hele centen per stuk, dan is de stukprijs verkeerd gelezen.
  const perPiece = total / quantity;
  const wholeCents = Math.abs(perPiece * 100 - Math.round(perPiece * 100)) < 0.01;
  return wholeCents ? { price: round2(perPiece), total, unsure: true } : { price: unit, total: round2(quantity * unit), unsure: true };
}

export function parseReceipt(text: string): Receipt {
  const all = text.split(/\r?\n/).map(tidyLine).filter(Boolean);
  const chain = CHAINS.find(([re]) => re.test(text))?.[1] ?? null;
  // Staat er een kop ("OMSCHRIJVING ... EUR")? Dan beginnen de producten daarna.
  const header = all.findIndex((l) => /^omschrijving\b/i.test(l));
  const body = header >= 0 ? all.slice(header + 1) : all;

  const lines: ReceiptLine[] = [];
  let total: number | null = null;
  let savings: number | null = null;
  let savingsNext = false;                             // het bedrag staat op de regel ná "Jouw totale besparing is"
  let ended = false;                                   // voorbij de producten ("Aantal 59 art.")
  let pendingQty: { qty: number; unit: number } | null = null;

  for (const l of body) {
    const amounts = [...l.matchAll(AMOUNT)].map((m) => ({ value: Number(`${m[2]}.${m[3]}`), negative: !!m[1], index: m.index! }));
    const last = amounts[amounts.length - 1];

    if (END.test(l)) {
      if (/^(totaal|te betalen|totaalbedrag)/i.test(l) && last && total == null) total = last.value;
      ended = true;
      continue;
    }
    if (ended) {
      // Na de producten staat soms hoeveel je in totaal bespaarde: een extra controlegetal.
      if (savings == null && (savingsNext || /totale\s+besp/i.test(l))) {
        if (last) { savings = last.value; savingsNext = false; } else savingsNext = /totale\s+besp/i.test(l);
      }
      continue;
    }
    if (!last) continue;
    const prev = lines[lines.length - 1];

    // Gewogen product: "1,060 kg x 1,85 EUR/kg" hoort bij de regel erboven
    const weight = l.match(WEIGHT);
    if (weight) {
      if (prev) {
        const kg = Number(weight[1].replace(',', '.'));
        let perKg = Number(`${weight[2]}.${weight[3]}`);
        let unsure = false;
        if (kg > 0 && Math.abs(kg * perKg - prev.total) > 0.02) {
          // Gewicht × kiloprijs klopt niet met het regelbedrag: één van de twee is verkeerd gelezen.
          // Scheelt de uitgerekende kiloprijs maar één cijfer met de gelezen prijs, dan was dát de leesfout.
          const derived = round2(prev.total / kg);
          const a = perKg.toFixed(2), b = derived.toFixed(2);
          const oneDigitOff = a.length === b.length && [...a].filter((ch, i) => ch !== b[i]).length === 1;
          if (oneDigitOff && Math.abs(kg * derived - prev.total) <= 0.02) perKg = derived; else unsure = true;
        }
        prev.perKg = true;
        prev.quantity = 1;
        prev.price = perKg;
        if (unsure) prev.unsure = true; else delete prev.unsure;
      }
      continue;
    }
    const namePart = l.slice(0, amounts[0].index).trim();

    // Korting op de regel erboven
    if (last.negative || DISCOUNT.test(namePart)) {
      if (prev) prev.discount = round2((prev.discount ?? 0) + last.value);
      continue;
    }
    // "2 x 0,89" op een eigen regel: hoort bij de regel erboven of eronder
    const qtyOnly = l.match(/^(\d{1,2})\s*[xX×*]+\s*(\d{1,4})[.,](\d{2})$/);
    if (qtyOnly) {
      const q = { qty: Number(qtyOnly[1]), unit: Number(`${qtyOnly[2]}.${qtyOnly[3]}`) };
      if (prev && prev.quantity === 1 && Math.abs(prev.total - q.qty * q.unit) < 0.02) { prev.quantity = q.qty; prev.price = q.unit; }
      else pendingQty = q;
      continue;
    }
    if (SKIP.test(l)) continue;

    // Productregel: naam, eventueel "6 x 2,59", en als laatste het regelbedrag
    const qty = l.match(QTY);
    if (qty) {
      const quantity = Number(qty[1]);
      const unit = Number(`${qty[2]}.${qty[3]}`);
      // Regelbedrag onleesbaar ("6 x 1,19 7148")? Dan rekenen we het zelf uit.
      const lineTotal = amounts.length >= 2 && last.index > qty.index! ? last.value : round2(quantity * unit);
      const r = reconcile(quantity, unit, lineTotal);
      const name = tidyName(l.slice(0, qty.index));
      if (name.length >= 2) lines.push({ raw: l, name, price: r.price, quantity, total: r.total, ...(r.unsure ? { unsure: true } : {}) });
      pendingQty = null;
      continue;
    }
    // Aantal of het x-teken slecht gelezen ("zZz x 1,99 3,98", "á« 2,49 9,96", "2 « 1,48 2,96"):
    // twee bedragen aan het eind waarvan het tweede een heel aantal keer het eerste is.
    if (amounts.length >= 2) {
      const unit = amounts[amounts.length - 2].value;
      const before = l.slice(0, amounts[amounts.length - 2].index);
      const ratio = unit > 0 ? last.value / unit : 0;
      const whole = Math.round(ratio);
      const marked = /\S\s*[xX×*«]\S{0,2}\s*$/.test(before);
      if ((whole >= 2 && whole <= 30 && Math.abs(ratio - whole) < 0.02) || (marked && whole >= 1 && whole <= 30)) {
        const exact = Math.abs(ratio - whole) < 0.02;
        // naam = alles vóór het aantal; een "2" wordt soms als "zZz" gelezen
        const name = tidyName(before.replace(/\s+\S{0,3}[xX×*«]\S{0,2}\s*$/, '').replace(/\s+(?:\d{1,2}|[zZ]{1,3})\s*$/, ''));
        if (name.length >= 2) {
          lines.push({ raw: l, name, price: exact ? unit : round2(last.value / whole), quantity: whole, total: last.value, ...(exact ? {} : { unsure: true }) });
          pendingQty = null;
          continue;
        }
      }
    }
    // Stukprijs onleesbaar ("2x 0,657 1,34"): het aantal staat er wel, de stukprijs rekenen we uit
    // (alleen als er na de x iets staat dat op een prijs lijkt: "Vuilniszak 71x110" is een maat, geen aantal)
    const loose = l.match(/^(.*?\S)\s+(\d{1,2})\s*[xX×*«]+\s*\d+[.,]\d+\S*\s/);
    if (loose && amounts.length === 1 && Number(loose[2]) >= 2 && Number(loose[2]) <= 30) {
      const quantity = Number(loose[2]);
      const perPiece = last.value / quantity;
      const name = tidyName(loose[1]);
      if (name.length >= 2) {
        const wholeCents = Math.abs(perPiece * 100 - Math.round(perPiece * 100)) < 0.01;
        lines.push({ raw: l, name, price: round2(perPiece), quantity, total: last.value, ...(wholeCents ? {} : { unsure: true }) });
        pendingQty = null;
        continue;
      }
    }
    let quantity = 1;
    let price = last.value;
    if (pendingQty && Math.abs(pendingQty.qty * pendingQty.unit - last.value) < 0.02) {
      quantity = pendingQty.qty;
      price = pendingQty.unit;
    }
    pendingQty = null;
    const name = tidyName(namePart.replace(/\s\d{1,2}\s*[xX×*]+$/, ''));
    if ((name.match(/[a-zà-ÿ]/gi) ?? []).length < 2 || price <= 0 || price > 500) continue;
    lines.push({ raw: l, name, price, quantity, total: last.value });
  }
  return { chain, lines, total, savings };
}

/** Wat je per stuk betaalde, na korting. */
export function netUnitPrice(l: ReceiptLine): number {
  return round2((l.total - (l.discount ?? 0)) / (l.perKg ? 1 : l.quantity));
}

/** Som van alle regels na korting: hoort gelijk te zijn aan het totaal van de bon. */
export function receiptSum(lines: ReceiptLine[]): number {
  return round2(lines.reduce((t, l) => t + l.total - (l.discount ?? 0), 0));
}

/**
 * Klopt de lezing met de controlegetallen op de bon zelf?
 * Staat de totale besparing erop, dan moeten de regelbedragen samen "Totaal + besparing" zijn. Dat is de
 * betrouwbaarste controle: de klein gedrukte kortingsregels doen dan niet mee. Anders: regels min korting = Totaal.
 */
export function checkReceipt(r: Receipt): { expected: number; got: number; ok: boolean } | null {
  if (r.total == null) return null;
  const gross = r.savings != null;
  const expected = round2(r.total + (gross ? r.savings! : 0));
  const got = gross ? round2(r.lines.reduce((t, l) => t + l.total, 0)) : receiptSum(r.lines);
  return { expected, got, ok: Math.abs(expected - got) < 0.015 };
}

// ---------- Twee lezingen van dezelfde bon samenvoegen ----------
// Kleine lettertjes worden soms verkeerd gelezen (een 8 als 3). Leest de app de bon twee keer op een andere
// manier, dan verschillen de fouten. De controlegetallen op de bon vertellen welke combinatie klopt.

function similarity(a: string, b: string): number {
  const x = a.toLowerCase(), y = b.toLowerCase();
  if (x === y) return 1;
  const m = x.length, n = y.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

/** Regels van twee lezingen naast elkaar leggen (zelfde volgorde, namen mogen iets afwijken). */
function align(a: ReceiptLine[], b: ReceiptLine[]): [ReceiptLine | null, ReceiptLine | null][] {
  const m = a.length, n = b.length;
  const same = (i: number, j: number) => {
    const sim = similarity(a[i].name, b[j].name);
    return sim >= 0.6 || (sim >= 0.35 && a[i].total === b[j].total);
  };
  const score = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      score[i][j] = Math.max(score[i + 1][j], score[i][j + 1], same(i, j) ? score[i + 1][j + 1] + 1 : 0);
    }
  }
  const out: [ReceiptLine | null, ReceiptLine | null][] = [];
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && same(i, j) && score[i][j] === score[i + 1][j + 1] + 1) out.push([a[i++], b[j++]]);
    else if (j >= n || (i < m && score[i + 1][j] >= score[i][j + 1])) out.push([a[i++], null]);
    else out.push([null, b[j++]]);
  }
  return out;
}

const MAX_SWAPS = 3; // meer wissels dan dit en "het klopt precies" kan toeval zijn

/**
 * Voegt twee lezingen samen (a is de hoofdlezing). Waar ze verschillen, kiest dit de combinatie die precies
 * klopt met de controlegetallen op de bon, mits daar maar een paar wissels voor nodig zijn. Lukt dat niet,
 * dan blijft de hoofdlezing staan en krijgen de regels waar de lezingen verschillen een waarschuwing.
 */
export function mergeReceipts(a: Receipt, b: Receipt): Receipt {
  const total = a.total ?? b.total;
  const savings = a.savings ?? b.savings ?? null;
  const base: Receipt = { ...a, chain: a.chain ?? b.chain, total, savings };
  if (!a.lines.length || (total == null && b.lines.length > a.lines.length)) return { ...b, chain: base.chain, total, savings };
  if (total == null) return base;
  const gross = savings != null;
  const cents = (l: ReceiptLine) => Math.round((gross ? l.total : l.total - (l.discount ?? 0)) * 100);
  const target = Math.round((total + (gross ? savings! : 0)) * 100);

  const pairs = align(a.lines, b.lines);
  // Per regel de keuzes: uit lezing a, uit lezing b (als het bedrag afwijkt), of weglaten (staat maar in één lezing)
  const choices = pairs.map(([x, y]) => {
    const opts: (ReceiptLine | null)[] = [];
    if (x) opts.push(x);
    if (y && (!x || cents(y) !== cents(x))) opts.push(x ? { ...x, total: y.total, price: y.price, quantity: y.quantity, perKg: y.perKg, raw: y.raw } : y);
    if (!x) opts.push(null); else if (!y) opts.push(null);
    return x ? opts : [null, ...opts.filter(Boolean)];   // een regel die alleen in b staat, doet standaard niet mee
  });
  const open = choices.map((c, i) => (c.length > 1 ? i : -1)).filter((i) => i >= 0);
  const fixed = choices.reduce((t, c) => t + (c.length === 1 && c[0] ? cents(c[0]) : 0), 0);
  let best: number[] | null = null;
  let bestCost = MAX_SWAPS + 1;
  const pick = new Array<number>(open.length).fill(0);
  const walk = (k: number, sum: number, cost: number) => {
    if (cost >= bestCost) return;
    if (k === open.length) {
      if (sum === target) { best = pick.slice(); bestCost = cost; }
      return;
    }
    choices[open[k]].forEach((opt, o) => {
      pick[k] = o;
      walk(k + 1, sum + (opt ? cents(opt) : 0), cost + (o === 0 ? 0 : 1));
    });
  };
  walk(0, fixed, 0);

  const chosen = best as number[] | null;
  const lines: ReceiptLine[] = [];
  choices.forEach((c, i) => {
    const k = open.indexOf(i);
    const line = k === -1 ? c[0] : c[chosen ? chosen[k] : 0];
    if (!line) return;
    if (k !== -1 && !chosen) {
      // Geen sluitende combinatie: laat zien waar de lezingen verschillen
      const other = c.find((o) => o && o !== line);
      lines.push({ ...line, unsure: true, ...(other ? { alt: other.total } : {}) });
    } else if (k !== -1) {
      const { unsure: _u, alt: _a, ...clean } = line;   // door de controle bevestigd
      lines.push(clean);
    } else lines.push(line);
  });
  return { chain: base.chain, lines, total, savings };
}
