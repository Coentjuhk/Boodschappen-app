# Boodschappen

Gedeelde boodschappenlijst voor twee (of meer) telefoons, met prijzen, aanbiedingen en receptfoto's.

- **Altijd up-to-date:** wijzigingen staan binnen een seconde op de andere telefoon.
- **Werkt ook met slecht bereik:** de lijst staat op je telefoon en is er dus altijd. Afvinken en toevoegen zonder verbinding wordt bewaard en vanzelf verstuurd zodra het weer kan.
- **Ongedaan maken:** per ongeluk afgevinkt, verwijderd of gewist? De melding onderin zet het met één tik terug.
- **Lijstjes droppen:** typ één product, of plak een hele lijst (uit WhatsApp, Notities of Listonic). Elke regel wordt een product, en "2x melk" of "500 g gehakt" wordt herkend.
- **Receptfoto → lijst:** maak een foto van een recept. De telefoon leest de tekst zelf (gratis). Je ziet de ingrediënten, kiest het aantal personen en vinkt aan wat je al hebt.
- **Recepttekst plakken:** kopieer een recept van een website, of tekst uit een foto (iPhone: houd je vinger op de tekst in Foto's; Android: Google Lens). De app pakt alleen de ingrediënten eruit.
- **Per winkel gesorteerd:** binnen elke winkel op looproute (groente → brood → vlees → zuivel → …).
- **Prijzen en aanbiedingen:** AH en Jumbo automatisch, elke ochtend ververst en direct bij het toevoegen. Met acties als 1+1 gratis, 2e halve prijs en "3 voor €5", en een bundeltip ("neem er 2: zelfde prijs"). Acties die nog moeten beginnen ("vanaf maandag in de bonus") worden aangekondigd maar nog niet meegerekend.
- **Jullie eigen product:** tik bij een product op wat jullie altijd kopen (📌). De app onthoudt dat per winkel, ook voor de volgende keer dat het op de lijst komt.
- **⏳ Wachten op aanbieding:** zet dingen als scheermesjes of knakworsten op de wachtlijst. Bij een goede aanbieding (of onder je richtprijs) komen ze vanzelf op de boodschappenlijst. Een actie telt alleen als je er niet duurder mee uit bent dan met wat er nu al ligt: "2 voor € 4,99" op merkknakworst telt niet als er ook knakworst van € 1,29 is. De app vergelijkt per kilo, liter of stuk en legt uit waarom een actie niet telt. Wil je juist dat merk? Tik op "Toch dit product volgen".
- **🧾 Kassabon scannen:** fotografeer een of meer bonnen, of kies screenshots van de digitale bonnen in de Lidl Plus- of AH-app. De app leest de prijzen (gratis, op de telefoon) en onthoudt ze per winkel. Zo leert hij ook de Lidl-prijzen.
- **Drie modi:** *Goedkoopst* (alle winkels), *Mijn winkels* (een selectie) of *Eén winkel*. Dit stel je per telefoon in, zodat jullie elk je eigen weergave hebben.
- **Online bestellen** telt mee, inclusief bezorgkosten en minimaal bestelbedrag.
- **Zelf prijzen invullen** voor de slager, bakker, Primera, bouwmarkt en andere winkels zonder online prijzen. De app onthoudt ze.

Werkt op iPhone en Android: je zet de app op je beginscherm, zonder App Store.

---

## Installeren (eenmalig, ±10 minuten)

**Helemaal gratis.** Je hebt alleen een gratis Vercel-account nodig (inloggen met GitHub). De database wordt automatisch klaargezet.

### Stap 1: App online zetten (Vercel, gratis)
1. Ga naar [vercel.com](https://vercel.com) → **Sign Up** → **Continue with GitHub**.
2. Kies **Add New… → Project** → **Boodschappen-app** → **Import**.
3. Klik op **Deploy**. Je krijgt een adres zoals `boodschappen-app-xxx.vercel.app`. De app zegt dan nog "Bijna klaar"; dat klopt.

### Stap 2: Database koppelen (Supabase via Vercel, gratis)
1. Open in Vercel je project → tab **Storage** → **Create Database** → **Supabase** → gratis plan, regio *Frankfurt* of *Londen* → **Create** en daarna **Connect**.
   Vercel vult nu zelf alle databasegegevens in.
2. Ga naar tab **Deployments** → ⋯ bij de bovenste → **Redeploy**.
   Tijdens het opnieuw bouwen zet de app zelf de database klaar.

De prijzen worden elke ochtend ververst, en ook meteen als je iets toevoegt of op ↻ drukt.

### Stap 3: Op jullie telefoons
- **iPhone:** open het adres in Safari → *Nieuwe gedeelde lijst starten* → deelknop → **Zet op beginscherm**. De app op je beginscherm heeft op de iPhone een eigen geheugen: hij vraagt de eerste keer alleen nog je naam en opent dan dezelfde lijst.
- In de app: **Winkels & delen** → **Deel uitnodiging**, en stuur de link via WhatsApp naar je partner.
- **Android:** open de link in Chrome → *Meedoen met de lijst* → menu ⋮ → **App installeren**.

<details>
<summary>Optioneel: slimmere receptherkenning met AI (betaald)</summary>

Het gratis uitlezen werkt goed bij gedrukte recepten. Voor handgeschreven briefjes of rommelige foto's kun je een Anthropic API-sleutel toevoegen (`ANTHROPIC_API_KEY` in Vercel, een paar cent per foto). Dat staat los van een Claude-abonnement. Zonder sleutel gebruikt de app gewoon de gratis methode.

</details>

<details>
<summary>Liever zelf een Supabase-project aanmaken?</summary>

Maak een project op supabase.com en plak `supabase/schema.sql` in de SQL Editor (**Run**). Zet daarna in Vercel deze variabelen:

| Naam | Waarde |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role/secret key |

</details>

---

## Wat wel en niet automatisch gaat

| Winkel | Prijzen |
|---|---|
| Albert Heijn ('t Plateau, De Akkers, bezorgen) | ✅ automatisch, incl. bonus |
| Jumbo (bezorgen) | ✅ automatisch, incl. aanbiedingen |
| Dirk (De Bas), Lidl, Aldi, Plus, Kruidvat, bouwmarkt, Dierenplezier, Primera | ✍️ zelf invullen per product (wordt onthouden); automatische koppeling volgt waar mogelijk |
| Slager, bakker | ✍️ zelf invullen |

De AH- en Jumbo-koppelingen zijn **niet officieel**: het zijn dezelfde koppelingen die hun eigen apps gebruiken. Als een winkel iets verandert, kan zo'n bron tijdelijk stoppen. De app laat dan een melding zien en werkt verder met de laatst bekende prijzen.

**Productkeuze:** bij "melk" neemt de app per winkel het eerste passende product dat de winkel zelf teruggeeft (geen gesponsorde producten, geen grootverpakkingen, geen online-bundels). Klopt het niet, tik dan op het product en kies het juiste (📌); dat wordt onthouden. Weet de app het niet zeker, dan rekent hij niets mee tot je gekozen hebt.

**Bonprijzen:** een prijs van een kassabon telt ook mee als de naam bijna gelijk is ("Melk" op de lijst, "HALFV MELK 1L" op de bon), zolang er maar één zo'n prijs bij die winkel is. Een eigen prijs verwijder je met ✕ in het productscherm.

**Lijst kwijt?** Onder *Winkels & delen* staat de code van jullie lijst. Daarmee kom je op elke telefoon weer bij dezelfde lijst (*Ik heb al een lijst of een code*, of *Andere lijst openen*).

**"Is een extra winkel het waard?"** (onder Winkels & delen): de app stuurt je pas naar een extra winkel als je daar minstens dat bedrag bespaart (standaard €1,50).

## Ontwikkelen

```bash
npm install
cp .env.example .env.local   # vul je Supabase-gegevens in
npm run dev                  # app op http://localhost:5173 (de /api-functies draaien via `vercel dev`)
npm test                     # tests: lijst-herkenning, aanbiedingen, productkeuze, winkelkeuze, bonnen, wachtrij
LIVE=1 npx vitest run tests/live.test.ts --silent=false   # echte AH/Jumbo-bronnen proberen

# Browsertest met nagebootste database, inclusief wegvallend bereik (vereist Playwright):
VITE_SUPABASE_URL=https://demo.supabase.co VITE_SUPABASE_ANON_KEY=demo npx vite build --outDir /tmp/bs-demo
node tests/e2e/app.e2e.cjs /tmp/bs-demo
```

Structuur:
- `src/`: de app (React)
- `shared/`: logica die app en server delen: lijst-herkenning, categorieën, aanbiedingen, winkelkeuze
- `api/`: serverfuncties op Vercel: `prices` (prijzen ophalen), `recipe` (foto lezen, optioneel), `cron/refresh` (dagelijks verversen), `manifest` (beginscherm-icoon met de code van je lijst), `device` (aanmelden zonder account)
- `supabase/schema.sql`: de database (wordt bij elke deploy automatisch bijgewerkt)
