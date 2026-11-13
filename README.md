# Boodschappen

Gedeelde boodschappenlijst voor twee (of meer) telefoons, met prijzen, aanbiedingen en receptfoto's.

- **Altijd up-to-date:** wijzigingen staan binnen een seconde op de andere telefoon.
- **Lijstjes droppen:** typ één product, of plak een hele lijst (uit WhatsApp, Notities of Listonic). Elke regel wordt een product, en "2x melk" of "500 g gehakt" wordt herkend.
- **Receptfoto → lijst:** maak een foto van een recept. Je ziet de ingrediënten, kiest het aantal personen en vinkt aan wat je al hebt.
- **Per winkel gesorteerd:** binnen elke winkel op looproute (groente → brood → vlees → zuivel → …).
- **Prijzen en aanbiedingen:** AH en Jumbo automatisch, elke ochtend ververst en direct bij het toevoegen. Met acties als 1+1 gratis, 2e halve prijs en "3 voor €5", en een bundeltip ("neem er 2: zelfde prijs").
- **Drie modi:** *Goedkoopst* (alle winkels), *Mijn winkels* (een selectie) of *Eén winkel*.
- **Online bestellen** telt mee, inclusief bezorgkosten en minimaal bestelbedrag.
- **Zelf prijzen invullen** voor de slager, bakker, Primera, bouwmarkt en andere winkels zonder online prijzen. De app onthoudt ze.

Werkt op iPhone en Android: je zet de app op je beginscherm, zonder App Store.

---

## Installeren (eenmalig, ±20 minuten)

Je hebt drie gratis accounts nodig. Alleen de receptfoto's kosten een klein beetje geld.

### 1. Database: Supabase (gratis)
1. Maak een account op [supabase.com](https://supabase.com) en klik op **New project** (regio: *West EU*).
2. Ga naar **SQL Editor** → **New query**, plak de inhoud van [`supabase/schema.sql`](supabase/schema.sql) en klik op **Run**.
3. Ga naar **Authentication** → **Sign In / Providers** en zet **Allow anonymous sign-ins** aan. Zo hoeven jullie geen account aan te maken: de huishoudcode is genoeg.
4. Ga naar **Project Settings** → **API** en noteer:
   - de *Project URL*
   - de *anon / publishable key*
   - de *service_role / secret key* (geheim houden!)

### 2. AI voor receptfoto's: Anthropic
1. Maak een account op [console.anthropic.com](https://console.anthropic.com), zet er €5 tegoed op en maak een **API key** aan.
2. Eén receptfoto kost een paar cent.

### 3. Hosting: Vercel (gratis)
1. Log in op [vercel.com](https://vercel.com) met GitHub en kies **Add New → Project** → deze repository.
2. Vul onder **Environment Variables** in:

   | Naam | Waarde |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL uit stap 1 |
   | `VITE_SUPABASE_ANON_KEY` | anon key uit stap 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key uit stap 1 |
   | `ANTHROPIC_API_KEY` | key uit stap 2 |
   | `CRON_SECRET` | een willekeurig lang wachtwoord |

3. Klik op **Deploy**. Je krijgt een adres zoals `boodschappen-xxx.vercel.app`.
4. De prijzen worden elke ochtend om 06:00 ververst (`vercel.json`). Daarnaast ook meteen wanneer je iets toevoegt, en als je op ↻ drukt.

### 4. Op jullie telefoons
- **iPhone:** open het adres in Safari, kies *Nieuwe gedeelde lijst starten*, en dan deelknop → **Zet op beginscherm**.
- In de app: **Winkels & delen** → **Deel uitnodiging**, en stuur de link naar je partner.
- **Android:** open de link in Chrome, kies *Meedoen*, en dan menu ⋮ → **App installeren**.

---

## Wat wel en niet automatisch gaat

| Winkel | Prijzen |
|---|---|
| Albert Heijn ('t Plateau, De Akkers, bezorgen) | ✅ automatisch, incl. bonus |
| Jumbo (bezorgen) | ✅ automatisch, incl. aanbiedingen |
| Lidl, Aldi, Plus, Kruidvat, bouwmarkt, Dierenplezier, Primera | ✍️ zelf invullen per product (wordt onthouden); automatische koppeling volgt waar mogelijk |
| Slager, bakker | ✍️ zelf invullen |

De AH- en Jumbo-koppelingen zijn **niet officieel**: het zijn dezelfde koppelingen die hun eigen apps gebruiken. Als een winkel iets verandert, kan zo'n bron tijdelijk stoppen. De app laat dan een melding zien en werkt verder met de laatst bekende prijzen.

**Productkeuze:** de app zoekt bij "melk" de best passende producten. Klopt het niet, tik dan op het product en kies het juiste (📌). Of maak de naam specifieker, bijvoorbeeld "halfvolle melk 1,5 l".

**"Is een extra winkel het waard?"** (onder Winkels & delen): de app stuurt je pas naar een extra winkel als je daar minstens dat bedrag bespaart (standaard €1,50).

## Ontwikkelen

```bash
npm install
cp .env.example .env.local   # vul je Supabase-gegevens in
npm run dev                  # app op http://localhost:5173 (de /api-functies draaien via `vercel dev`)
npm test                     # tests voor lijst-herkenning, aanbiedingen en winkelkeuze
```

Structuur:
- `src/`: de app (React)
- `shared/`: logica die app en server delen: lijst-herkenning, categorieën, aanbiedingen, winkelkeuze
- `api/`: serverfuncties op Vercel: `prices` (prijzen ophalen), `recipe` (foto lezen), `cron/refresh` (dagelijks verversen)
- `supabase/schema.sql`: de database
