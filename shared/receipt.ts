// Kassabon (foto of screenshot, na tekstherkenning) omzetten in producten met prijzen.

export interface ReceiptLine {
  raw: string;       // zoals op de bon
  name: string;      // opgeschoond
  price: number;     // prijs per stuk
  quantity: number;
  discount?: number; // korting die direct onder deze regel stond (positief bedrag)
}

export interface Receipt {
  chain: string | null; // 'lidl', 'ah', 'dirk', 'jumbo', 'aldi', 'plus' of null
  lines: ReceiptLine[];
  total: number | null;
}

const CHAINS: [RegExp, string][] = [
  [/\blidl\b/i, 'lidl'],
  [/albert\s*heijn|\bah\b.*bonus/i, 'ah'],
  [/\bdirk\b|van\s*den\s*broek/i, 'dirk'],
  [/\bjumbo\b/i, 'jumbo'],
  [/\baldi\b/i, 'aldi'],
  [/\bplus\b/i, 'plus'],
  [/kruidvat/i, 'kruidvat'],
];

// Regels die geen product zijn
const SKIP = /\b(totaal|subtotaal|te betalen|betaald|pin|pinnen|contant|wisselgeld|btw|bonus\s*box|kaart|maestro|v\s*pay|visa|mastercard|transactie|terminal|autorisatie|kassa|bon\s*nr|filiaal|datum|tijd|bedankt|retour|statiegeld retour|spaarzegels|koopzegels|uw voordeel|totaal voordeel|lidl plus|aantal artikelen|klantenservice|openingstijden|www\.|tel\.?|kvk|btw-nr)\b/i;
const PRICE = /(-?\d{1,4})[.,](\d{2})(?!\d)/g;

const tidy = (s: string) => {
  const t = s
    .replace(/[*#]+/g, ' ')
    .replace(/\s+[A-D]$/i, '')           // btw-code achter de regel (Lidl: A/B)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function parseReceipt(text: string): Receipt {
  const rawLines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const chain = CHAINS.find(([re]) => re.test(text))?.[1] ?? null;
  const lines: ReceiptLine[] = [];
  let total: number | null = null;
  let pendingQty: { qty: number; unit: number } | null = null;

  for (const l of rawLines) {
    const prices = [...l.matchAll(PRICE)].map((m) => Number(`${m[1]}.${m[2]}`));
    if (/\b(totaal|te betalen)\b/i.test(l) && prices.length) {
      total = Math.abs(prices[prices.length - 1]);
      continue;
    }
    // "2 x 0,89" of "2 X 0,89" op een eigen regel (Lidl/AH): geldt voor de volgende of vorige productregel
    const qtyOnly = l.match(/^(\d{1,2})\s*[xX×*]+\s*(\d{1,4})[.,](\d{2})\s*$/);
    if (qtyOnly) {
      const q = { qty: Number(qtyOnly[1]), unit: Number(`${qtyOnly[2]}.${qtyOnly[3]}`) };
      const prev = lines[lines.length - 1];
      if (prev && Math.abs(prev.price - q.qty * q.unit) < 0.02) { prev.quantity = q.qty; prev.price = q.unit; }
      else pendingQty = q;
      continue;
    }
    if (!prices.length) continue;
    const last = prices[prices.length - 1];
    const namePart = l.slice(0, l.search(/-?\d{1,4}[.,]\d{2}(?!\d)/)).trim();
    const letters = (namePart.match(/[a-zà-ÿ]/gi) ?? []).length;

    // Korting (negatief bedrag of kortingsregel) → van de vorige productregel aftrekken
    if (last < 0 || /korting|prijsvoordeel/i.test(namePart)) {
      const prev = lines[lines.length - 1];
      if (prev) prev.discount = Math.round(((prev.discount ?? 0) + Math.abs(last)) * 100) / 100;
      continue;
    }
    if (SKIP.test(l) || letters < 2) continue;

    // "MELK HALFVOL 2 x 0,99 1,98" op één regel
    const inline = namePart.match(/^(.*?)\s+(\d{1,2})\s*[xX×*]+\s*$/) ?? null;
    const inlineQty = l.match(/(\d{1,2})\s*[xX×*]+\s*(\d{1,4})[.,](\d{2})/);
    let quantity = 1;
    let price = last;
    let name = namePart;
    if (inlineQty) {
      quantity = Number(inlineQty[1]);
      price = Number(`${inlineQty[2]}.${inlineQty[3]}`);
      name = l.slice(0, l.indexOf(inlineQty[0])).trim();
    } else if (inline) {
      name = inline[1];
    } else if (pendingQty && Math.abs(pendingQty.qty * pendingQty.unit - last) < 0.02) {
      quantity = pendingQty.qty;
      price = pendingQty.unit;
    }
    pendingQty = null;
    if (price <= 0 || price > 500) continue;
    lines.push({ raw: l, name: tidy(name), price, quantity });
  }
  return { chain, lines, total };
}

/** Prijs per stuk na korting. */
export function netUnitPrice(l: ReceiptLine): number {
  return Math.round(((l.price * l.quantity - (l.discount ?? 0)) / l.quantity) * 100) / 100;
}
