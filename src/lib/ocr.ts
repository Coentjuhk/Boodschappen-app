// Gratis tekstherkenning op de telefoon zelf (Tesseract, Nederlands).
import { checkReceipt, mergeReceipts, parseReceipt, type Receipt } from '../../shared/receipt';

/** Foto verkleinen en als canvas teruggeven (voor de AI-route bij recepten). */
export async function toCanvas(file: File, max: number): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

const STRIP_HEIGHT = 1700; // hoogte van één strook die we laten lezen (na schalen)

/**
 * Hoe groot moet het beeld worden om goed leesbaar te zijn?
 * Een lange bon (gedeeld uit de Lidl Plus- of AH-app) is smal: die vergroten we tot ±1300 pixels breed.
 * Verkleinen tot "het past" maakt de letters onleesbaar klein; daarom knippen we lange beelden in stroken.
 */
export function readingScale(width: number, height: number): number {
  const long = height / width > 2.2;
  if (long) return Math.min(6.5, Math.max(1, 1300 / width));
  return Math.min(1.5, 2400 / Math.max(width, height));
}

/**
 * Waar knippen we een lang beeld in stroken? Bij voorkeur op een lege regel, zodat er nooit dwars door
 * een tekstregel geknipt wordt. `darkness[y]` is de donkerste waarde op rij y (255 = helemaal wit).
 */
export function stripCuts(darkness: ArrayLike<number>, stripRows: number): number[] {
  const total = darkness.length;
  const cuts = [0];
  let y = 0;
  while (total - y > stripRows * 1.15) {
    const target = y + stripRows;
    let best = target;
    // zoek de witste rij in het laatste vijfde deel van de strook
    for (let r = target; r > target - stripRows * 0.2 && r > y + 1; r--) {
      if (darkness[r] > darkness[best]) best = r;
    }
    cuts.push(best);
    y = best;
  }
  cuts.push(total);
  return cuts;
}

/** Per rij de donkerste waarde, gemeten op een smalle verkleining van het beeld. Plus: hoeveel is zuiver wit? */
function scan(bmp: ImageBitmap): { darkness: Uint8Array; white: number } {
  const w = 48;
  const h = Math.min(bmp.height, 12000);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const darkness = new Uint8Array(h);
  let white = 0;
  for (let y = 0; y < h; y++) {
    let min = 255;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
      if (lum < min) min = lum;
      if (lum >= 245) white++;
    }
    darkness[y] = min;
  }
  return { darkness, white: white / (w * h) };
}

/** Alles wat donkerder is dan de drempel wordt zwart, de rest wit: strakke letters lezen het best. */
function blackAndWhite(ctx: CanvasRenderingContext2D, w: number, h: number, threshold: number) {
  const im = ctx.getImageData(0, 0, w, h);
  const p = im.data;
  for (let i = 0; i < p.length; i += 4) {
    const v = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000 < threshold ? 0 : 255;
    p[i] = p[i + 1] = p[i + 2] = v;
  }
  ctx.putImageData(im, 0, 0);
}

type Worker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;

async function startWorker(onProgress: (p: number) => void, rows: boolean): Promise<Worker> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('nld', 1, {
    logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') onProgress(m.progress); },
  });
  // 6 = één blok tekst: Tesseract leest dan regel voor regel (naam links, prijs rechts) in plaats van per kolom
  if (rows) await worker.setParameters({ tessedit_pageseg_mode: '6' as never, preserve_interword_spaces: '1' });
  return worker;
}

/** Eén beeld lezen, in stroken. `threshold` maakt het beeld eerst zwart-wit (alleen voor digitale bonnen). */
async function readImage(worker: Worker, bmp: ImageBitmap, darkness: Uint8Array, onStrip: (done: number, of: number) => void, threshold?: number): Promise<string> {
  const scale = readingScale(bmp.width, bmp.height);
  const toSource = bmp.height / darkness.length; // rij in de verkleining → rij in het beeld
  const cuts = stripCuts(darkness, Math.max(40, Math.round(STRIP_HEIGHT / scale / toSource)));
  const parts: string[] = [];
  for (let s = 0; s < cuts.length - 1; s++) {
    onStrip(s, cuts.length - 1);
    const y0 = Math.round(cuts[s] * toSource);
    const y1 = Math.round(cuts[s + 1] * toSource);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.max(1, Math.round((y1 - y0) * scale));
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, y0, bmp.width, y1 - y0, 0, 0, c.width, c.height);
    if (threshold) blackAndWhite(ctx, c.width, c.height, threshold);
    const { data } = await worker.recognize(c);
    parts.push(data.text ?? '');
  }
  return parts.join('\n');
}

/** Lees de tekst van één of meer foto's (voor recepten). onProgress krijgt (fotoNummer, 0..1). */
export async function readText(files: File[], onProgress: (index: number, p: number) => void): Promise<string[]> {
  let report = (_p: number) => {};
  const worker = await startWorker((p) => report(p), false);
  try {
    const out: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const bmp = await createImageBitmap(files[i]);
      let strip = 0, strips = 1;
      report = (p) => onProgress(i, (strip + p) / strips);
      out.push(await readImage(worker, bmp, scan(bmp).darkness, (s, of) => { strip = s; strips = of; }));
      bmp.close?.();
      onProgress(i, 1);
    }
    return out;
  } finally {
    await worker.terminate();
  }
}

export interface ReadReceipt {
  receipt: Receipt;
  text: string;       // de gelezen tekst (om te kunnen nakijken)
  rereads: number;    // hoe vaak de bon opnieuw gelezen is om een afwijking op te lossen
}

/**
 * Kassabonnen lezen. Een digitale bon (witte achtergrond) lezen we strak zwart-wit. Kloppen de regels
 * daarna niet met de controlegetallen op de bon (totaal en totale besparing), dan lezen we hem nog een keer
 * met een andere instelling en kiezen we per regel de lezing waarmee het wél klopt.
 */
export async function readReceipts(files: File[], onProgress: (index: number, p: number, pass: number) => void): Promise<ReadReceipt[]> {
  let report = (_p: number) => {};
  const worker = await startWorker((p) => report(p), true);
  try {
    const out: ReadReceipt[] = [];
    for (let i = 0; i < files.length; i++) {
      const bmp = await createImageBitmap(files[i]);
      const { darkness, white } = scan(bmp);
      const digital = white > 0.6; // schermafdruk of gedeelde bon, geen foto van papier
      let pass = 0, strip = 0, strips = 1;
      report = (p) => onProgress(i, (strip + p) / strips, pass);
      const read = (threshold?: number) => readImage(worker, bmp, darkness, (s, of) => { strip = s; strips = of; }, threshold);

      let text = await read(digital ? 190 : undefined);
      let receipt = parseReceipt(text);
      let rereads = 0;
      // Tweede (en zo nodig derde) lezing met een andere instelling, alleen als de controle niet sluit
      for (const threshold of digital ? [150, undefined] : [170]) {
        const check = checkReceipt(receipt);
        // Niets te controleren (geen totaal gevonden) of alles klopt: klaar. Helemaal niets gelezen: nog eens proberen.
        if (receipt.lines.length && (!check || check.ok)) break;
        pass = ++rereads;
        const again = await read(threshold);
        receipt = mergeReceipts(receipt, parseReceipt(again));
        if (!receipt.lines.length) text = again;
      }
      bmp.close?.();
      out.push({ receipt, text, rereads });
      onProgress(i, 1, pass);
    }
    return out;
  } finally {
    await worker.terminate();
  }
}
