// Rekenen met aanbiedingen: "1+1 gratis", "2e halve prijs", "3 voor 5,00", "25% korting".

export interface PricedProduct {
  price: number;          // huidige prijs per stuk
  base_price?: number | null;
  mechanic?: string | null;
}

export interface OfferResult {
  total: number;          // totaal voor de gevraagde hoeveelheid
  perUnit: number;
  /** Tip als je met een paar extra stuks goedkoper uit bent per stuk (bundel). */
  bundleTip?: { buy: number; total: number; perUnit: number; text: string };
}

type Mech =
  | { kind: 'xplusy'; x: number; y: number }
  | { kind: 'nth'; n: number; pct: number }
  | { kind: 'nfor'; n: number; total: number }
  | { kind: 'pct'; pct: number; minQty: number }
  | { kind: 'none' };

export function parseMechanic(raw?: string | null): Mech {
  if (!raw) return { kind: 'none' };
  const s = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  let m = s.match(/(\d+)\s*\+\s*(\d+)\s*(gratis)?/);
  if (m) return { kind: 'xplusy', x: +m[1], y: +m[2] };
  m = s.match(/(\d+)e\s+(halve prijs|gratis)/);
  if (m) return { kind: 'nth', n: +m[1], pct: m[2] === 'gratis' ? 100 : 50 };
  m = s.match(/(\d+)(?:e|de)?\s+(?:voor\s+)?(\d+)%\s*korting/);
  if (m) return { kind: 'nth', n: +m[1], pct: +m[2] };
  m = s.match(/(\d+)\s*(?:stuks?\s*)?voor\s*(?:€\s*)?(\d+(?:[.,]\d{1,2})?)/);
  if (m) return { kind: 'nfor', n: +m[1], total: Number(m[2].replace(',', '.')) };
  m = s.match(/(\d+)%\s*korting/);
  if (m) {
    const min = s.match(/vanaf\s+(\d+)/);
    return { kind: 'pct', pct: +m[1], minQty: min ? +min[1] : 1 };
  }
  return { kind: 'none' };
}

/** Totaal voor `qty` stuks, rekening houdend met de actie. */
export function offerTotal(p: PricedProduct, qty: number): number {
  const q = Math.max(1, Math.ceil(qty));
  const base = p.base_price ?? p.price;
  const mech = parseMechanic(p.mechanic);
  switch (mech.kind) {
    case 'xplusy': {
      const group = mech.x + mech.y;
      const groups = Math.floor(q / group);
      const rest = q - groups * group;
      return round(groups * mech.x * base + rest * base);
    }
    case 'nth': {
      const groups = Math.floor(q / mech.n);
      return round(q * base - groups * base * (mech.pct / 100));
    }
    case 'nfor': {
      const groups = Math.floor(q / mech.n);
      const rest = q - groups * mech.n;
      return round(groups * mech.total + rest * base);
    }
    case 'pct':
      return round(q >= mech.minQty ? q * base * (1 - mech.pct / 100) : q * base);
    default:
      return round(q * p.price);
  }
}

export function evaluateOffer(p: PricedProduct, qty: number): OfferResult {
  const q = Math.max(1, Math.ceil(qty));
  const total = offerTotal(p, q);
  const result: OfferResult = { total, perUnit: round(total / q) };
  // Bundeltip: zou 1–3 stuks extra de prijs per stuk duidelijk verlagen?
  for (let extra = 1; extra <= 3; extra++) {
    const t = offerTotal(p, q + extra);
    const per = t / (q + extra);
    if (per < result.perUnit * 0.9) {
      const sameMoney = t <= total + 0.005;
      result.bundleTip = {
        buy: q + extra,
        total: round(t),
        perUnit: round(per),
        text: sameMoney
          ? `Neem er ${q + extra}: zelfde prijs (${p.mechanic})`
          : `Neem er ${q + extra}: ${fmt(round(per))} per stuk (${p.mechanic})`,
      };
      break;
    }
  }
  return result;
}

const round = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => '€' + n.toFixed(2).replace('.', ',');
