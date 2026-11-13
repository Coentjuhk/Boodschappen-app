// Gratis tekstherkenning op de telefoon zelf (Tesseract, Nederlands).

/** Foto verkleinen en als canvas teruggeven. */
export async function toCanvas(file: File, max: number): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

/** Lees de tekst van één of meer foto's. onProgress krijgt (fotoNummer, 0..1). */
export async function readText(files: File[], onProgress: (index: number, p: number) => void): Promise<string[]> {
  const { createWorker } = await import('tesseract.js');
  let current = 0;
  const worker = await createWorker('nld', 1, {
    logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') onProgress(current, m.progress); },
  });
  try {
    const out: string[] = [];
    for (let i = 0; i < files.length; i++) {
      current = i;
      const { data } = await worker.recognize(await toCanvas(files[i], 2400));
      out.push(data.text ?? '');
    }
    return out;
  } finally {
    await worker.terminate();
  }
}
