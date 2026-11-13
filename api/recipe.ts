// POST /api/recipe  { image: base64 (jpeg), mediaType?: string }
// Leest een foto van een recept en geeft de ingrediënten terug.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { requireUser } from './_lib/server.js';
import { CATEGORIES } from '../shared/catalog.js';

export const config = { maxDuration: 60 };

const Recipe = z.object({
  is_recipe: z.boolean().describe('false als er geen recept/ingrediëntenlijst op de foto staat'),
  title: z.string().describe('Naam van het gerecht, in het Nederlands'),
  servings: z.number().describe('Aantal personen volgens het recept; 4 als het er niet staat'),
  ingredients: z.array(
    z.object({
      name: z.string().describe('Productnaam zoals je die in een Nederlandse supermarkt zoekt, bv. "kipfilet", "geraspte kaas"'),
      quantity: z.number().describe('Hoeveelheid als getal; 1 als onbekend'),
      unit: z.string().describe('g, kg, ml, l, st, el, tl, teen, blik, pak, bos — of leeg'),
      category: z.enum(CATEGORIES.map((c) => c.id) as [string, ...string[]]),
      pantry: z.boolean().describe('true voor basisspullen die de meeste mensen al in huis hebben (zout, peper, olie, water, suiker, bloem)'),
    }),
  ),
});

const SYSTEM = `Je leest foto's van recepten (kookboek, tijdschrift, handgeschreven briefje of een scherm) en haalt de ingrediëntenlijst eruit voor een Nederlandse boodschappenlijst.
- Vertaal naar het Nederlands en gebruik namen zoals ze in de supermarkt heten.
- Voeg dubbele ingrediënten samen.
- Laat bereidingsstappen weg; alleen wat je moet kopen.
- Staat er geen recept op de foto, zet is_recipe op false en geef een lege lijst.`;

const client = new Anthropic();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST' });
    await requireUser(req);
    const image: string | undefined = req.body?.image;
    const mediaType = (req.body?.mediaType ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp';
    if (!image) return res.status(400).json({ error: 'Geen foto ontvangen' });

    const response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'low', format: betaZodOutputFormat(Recipe) },
      // Weigert het model onverhoopt, dan probeert de API het automatisch met een ander model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: 'Welke ingrediënten moet ik kopen voor dit recept?' },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return res.status(422).json({ error: 'Kon het recept niet lezen. Probeer een scherpere foto.' });
    }
    res.status(200).json(response.parsed_output);
  } catch (e: any) {
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Even te druk, probeer het zo nog eens.' });
    if (e instanceof Anthropic.AuthenticationError) return res.status(500).json({ error: 'ANTHROPIC_API_KEY ontbreekt of klopt niet (Vercel-instellingen).' });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ error: `AI-fout: ${e.message}` });
    res.status(e.status ?? 500).json({ error: e.message ?? String(e) });
  }
}
