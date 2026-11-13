// Categorieën, welke soort winkel ze verkoopt, en de standaardwinkels in Spijkenisse.

export type StoreKind =
  | 'supermarkt' | 'drogist' | 'slager' | 'bakker' | 'bouwmarkt'
  | 'dierenwinkel' | 'primera' | 'slijterij' | 'overig';

export interface Category {
  id: string;
  label: string;
  emoji: string;
  kinds: StoreKind[];      // welke soorten winkels dit verkopen (eerste = meest logisch)
  keywords: string[];
}

// Volgorde = ongeveer de looproute in de supermarkt.
export const CATEGORIES: Category[] = [
  { id: 'groente', label: 'Groente & fruit', emoji: '🥦', kinds: ['supermarkt'],
    keywords: ['appel', 'peer', 'banaan', 'sinaasappel', 'mandarijn', 'citroen', 'limoen', 'druif', 'aardbei', 'framboos', 'blauwe bes', 'kiwi', 'mango', 'ananas', 'meloen', 'avocado', 'tomaat', 'tomaten', 'komkommer', 'paprika', 'ui', 'uien', 'knoflook', 'wortel', 'sla', 'spinazie', 'broccoli', 'bloemkool', 'courgette', 'aubergine', 'champignon', 'prei', 'aardappel', 'krieltjes', 'boon', 'bonen', 'sperziebonen', 'gember', 'peterselie', 'basilicum', 'koriander', 'bieslook', 'rucola', 'andijvie', 'boerenkool', 'zuurkool', 'spruit', 'radijs', 'selderij', 'venkel', 'pompoen', 'zoete aardappel', 'lente-ui', 'bosui', 'peper'] },
  { id: 'brood', label: 'Brood & bakkerij', emoji: '🍞', kinds: ['bakker', 'supermarkt'],
    keywords: ['brood', 'bolletje', 'broodje', 'croissant', 'stokbrood', 'baguette', 'krentenbol', 'beschuit', 'crackers', 'knäckebröd', 'wrap', 'tortilla', 'pita', 'taart', 'gebak', 'appeltaart', 'tompouce', 'cake', 'ontbijtkoek', 'pistolet', 'volkoren', 'casino'] },
  { id: 'vlees', label: 'Vlees & vis', emoji: '🥩', kinds: ['slager', 'supermarkt'],
    keywords: ['gehakt', 'kip', 'kipfilet', 'kippendij', 'drumstick', 'biefstuk', 'speklap', 'spek', 'spekjes', 'ontbijtspek', 'worst', 'rookworst', 'braadworst', 'hamburger', 'schnitzel', 'karbonade', 'varkenshaas', 'riblappen', 'sudderlap', 'shoarma', 'saté', 'sate', 'lamsvlees', 'rundvlees', 'zalm', 'kabeljauw', 'tonijn', 'garnalen', 'vis', 'vissticks', 'pangasius', 'tilapia', 'mosselen', 'slavink', 'blinde vink', 'cordon bleu', 'filet americain', 'rosbief', 'ham', 'salami', 'kipfiletplakjes', 'vleeswaren', 'gyros', 'stoofvlees'] },
  { id: 'zuivel', label: 'Zuivel, kaas & eieren', emoji: '🧀', kinds: ['supermarkt'],
    keywords: ['melk', 'halfvolle', 'volle melk', 'karnemelk', 'yoghurt', 'kwark', 'vla', 'boter', 'roomboter', 'margarine', 'kaas', 'geraspte kaas', 'mozzarella', 'feta', 'parmezaan', 'room', 'slagroom', 'kookroom', 'creme fraiche', 'zure room', 'ei', 'eieren', 'skyr', 'roomkaas', 'philadelphia', 'smeerkaas', 'mascarpone', 'ricotta', 'havermelk', 'sojamelk', 'amandelmelk'] },
  { id: 'voorraad', label: 'Voorraadkast', emoji: '🥫', kinds: ['supermarkt'],
    keywords: ['pasta', 'spaghetti', 'macaroni', 'penne', 'lasagne', 'rijst', 'noedels', 'mie', 'couscous', 'bloem', 'meel', 'suiker', 'zout', 'peper', 'olie', 'olijfolie', 'azijn', 'saus', 'ketchup', 'mayonaise', 'mayo', 'mosterd', 'sambal', 'ketjap', 'sojasaus', 'bouillon', 'blokje', 'kruiden', 'paprikapoeder', 'kerrie', 'oregano', 'tomatenpuree', 'passata', 'gepelde tomaten', 'blik', 'soep', 'pindakaas', 'jam', 'hagelslag', 'chocopasta', 'nutella', 'honing', 'muesli', 'cornflakes', 'havermout', 'ontbijtgranen', 'koffie', 'thee', 'cacao', 'bakpoeder', 'gist', 'vanille', 'chocolade', 'noten', 'pinda', 'rozijnen', 'kikkererwten', 'linzen', 'mais', 'tonijn in blik', 'pesto', 'curry', 'kokosmelk', 'paneermeel', 'maizena'] },
  { id: 'diepvries', label: 'Diepvries', emoji: '🧊', kinds: ['supermarkt'],
    keywords: ['diepvries', 'ijs', 'pizza', 'friet', 'patat', 'kroket', 'frikandel', 'bami', 'loempia', 'spinazie diepvries', 'doperwten', 'erwten'] },
  { id: 'snoep', label: 'Snoep, koek & chips', emoji: '🍪', kinds: ['supermarkt'],
    keywords: ['koek', 'koekjes', 'chips', 'snoep', 'drop', 'chocoladereep', 'reep', 'stroopwafel', 'nootjes', 'popcorn', 'borrelnoten', 'toast', 'snack'] },
  { id: 'drinken', label: 'Drinken', emoji: '🥤', kinds: ['supermarkt'],
    keywords: ['water', 'spa', 'cola', 'fanta', 'sprite', 'sinas', 'frisdrank', 'sap', 'jus', 'appelsap', 'sinaasappelsap', 'limonade', 'siroop', 'ice tea', 'energy', 'red bull'] },
  { id: 'alcohol', label: 'Bier & wijn', emoji: '🍷', kinds: ['supermarkt', 'slijterij'],
    keywords: ['bier', 'wijn', 'rosé', 'prosecco', 'champagne', 'whisky', 'wodka', 'jenever', 'rum', 'gin', 'likeur', 'radler'] },
  { id: 'huishouden', label: 'Huishouden', emoji: '🧽', kinds: ['supermarkt', 'drogist'],
    keywords: ['wc-papier', 'toiletpapier', 'keukenrol', 'tissues', 'afwasmiddel', 'vaatwastablet', 'vaatwas', 'wasmiddel', 'wasverzachter', 'allesreiniger', 'schoonmaak', 'vuilniszak', 'afvalzak', 'aluminiumfolie', 'huishoudfolie', 'bakpapier', 'boterhamzakje', 'vershoudfolie', 'sponsje', 'spons', 'bleek', 'glasreiniger', 'ontkalker', 'batterij', 'batterijen', 'lamp'] },
  { id: 'verzorging', label: 'Verzorging & drogist', emoji: '🧴', kinds: ['drogist', 'supermarkt'],
    keywords: ['shampoo', 'conditioner', 'douchegel', 'zeep', 'handzeep', 'tandpasta', 'tandenborstel', 'deo', 'deodorant', 'scheermesje', 'scheerschuim', 'bodylotion', 'zonnebrand', 'maandverband', 'tampons', 'luiers', 'billendoekjes', 'paracetamol', 'ibuprofen', 'pleister', 'vitamine', 'make-up', 'mascara', 'nagellak', 'wattenschijfjes', 'wattenstaafjes', 'haarlak', 'gel', 'crème', 'creme', 'parfum', 'lenzenvloeistof', 'flosdraad', 'mondwater'] },
  { id: 'huisdier', label: 'Huisdier', emoji: '🐾', kinds: ['dierenwinkel', 'supermarkt'],
    keywords: ['kattenvoer', 'hondenvoer', 'kattenbakvulling', 'kattengrit', 'brokken', 'snoepjes hond', 'kauwbot', 'vogelvoer', 'visvoer', 'konijnenvoer', 'hooi', 'strooisel', 'vlooien', 'ontworming', 'kattensnack', 'hondensnack', 'poepzakjes', 'dierenvoer'] },
  { id: 'kantoor', label: 'Kaarten, tijdschriften & post', emoji: '✉️', kinds: ['primera'],
    keywords: ['kaart', 'verjaardagskaart', 'wenskaart', 'postzegel', 'postzegels', 'tijdschrift', 'krant', 'cadeaukaart', 'giftcard', 'pen', 'pennen', 'schrift', 'envelop', 'enveloppen', 'cadeaupapier', 'inpakpapier', 'staatsloterij', 'lot', 'sigaretten', 'tabak', 'puzzelboek'] },
  { id: 'klussen', label: 'Klussen & tuin', emoji: '🔨', kinds: ['bouwmarkt'],
    keywords: ['schroef', 'schroeven', 'spijker', 'spijkers', 'plug', 'pluggen', 'verf', 'kwast', 'roller', 'tape', 'ducttape', 'kit', 'siliconenkit', 'lijm', 'boor', 'boortje', 'zaag', 'hamer', 'schuurpapier', 'potgrond', 'tuinaarde', 'zaden', 'plant', 'planten', 'bloembollen', 'kunstmest', 'gloeilamp', 'ledlamp', 'stekkerdoos', 'verlengsnoer', 'kabel', 'hout', 'plank', 'beits', 'grondverf', 'afvoerontstopper', 'tuinslang', 'handschoenen', 'wd-40', 'scharnier', 'slot'] },
  { id: 'overig', label: 'Overig', emoji: '🛒', kinds: ['supermarkt'], keywords: [] },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<string, Category>;

/** Categorie raden op basis van de naam. Langste trefwoord wint ("tonijn in blik" > "tonijn"). */
export function guessCategory(name: string): string {
  const n = ' ' + name.toLowerCase() + ' ';
  let best: { id: string; len: number } | null = null;
  for (const c of CATEGORIES) {
    for (const k of c.keywords) {
      const hit = n.includes(' ' + k) || n.includes(k + ' ') || n.trim() === k;
      if (hit && (!best || k.length > best.len)) best = { id: c.id, len: k.length };
    }
  }
  return best?.id ?? 'overig';
}

export interface StoreSeed {
  name: string;
  chain?: string;
  kinds: StoreKind[];
  location?: string;
  online?: boolean;
  delivery_fee?: number;
  min_order?: number;
  enabled?: boolean;
}

// Standaardwinkels voor Spijkenisse. In de app aan te passen of aan te vullen.
// Bezorgkosten/minimum zijn een schatting: pas ze aan in Instellingen naar wat je echt betaalt.
export const DEFAULT_STORES: StoreSeed[] = [
  { name: "Albert Heijn 't Plateau", chain: 'ah', kinds: ['supermarkt', 'drogist', 'dierenwinkel', 'slijterij'], location: "'t Plateau 31" },
  { name: "Lidl 't Plateau", chain: 'lidl', kinds: ['supermarkt', 'drogist', 'dierenwinkel'], location: "'t Plateau 3" },
  { name: 'Aldi Hoogwerfsingel', chain: 'aldi', kinds: ['supermarkt', 'drogist', 'dierenwinkel'], location: 'Hoogwerfsingel 2' },
  { name: "Primera 't Plateau", chain: 'primera', kinds: ['primera'], location: "'t Plateau 14" },
  { name: "Dierenplezier 't Plateau", chain: 'dierenplezier', kinds: ['dierenwinkel'], location: "'t Plateau 12" },
  { name: "Gall & Gall 't Plateau", chain: 'gallgall', kinds: ['slijterij'], location: "'t Plateau 19" },
  { name: 'Albert Heijn De Akkers', chain: 'ah', kinds: ['supermarkt', 'drogist', 'dierenwinkel', 'slijterij'], location: 'Winkelcentrum De Akkers', enabled: false },
  { name: 'Plus De Akkers', chain: 'plus', kinds: ['supermarkt', 'drogist', 'dierenwinkel'], location: 'Winterakker' },
  { name: 'Kruidvat', chain: 'kruidvat', kinds: ['drogist'], location: 'Centrum' },
  { name: 'Slager', kinds: ['slager'], location: 'zelf invullen' },
  { name: 'Bakker', kinds: ['bakker'], location: 'zelf invullen' },
  { name: 'Bouwmarkt', chain: 'gamma', kinds: ['bouwmarkt'], location: 'zelf invullen' },
  { name: 'AH bezorgen (online)', chain: 'ah', kinds: ['supermarkt', 'drogist', 'dierenwinkel', 'slijterij'], online: true, delivery_fee: 5.95, min_order: 50 },
  { name: 'Jumbo bezorgen (online)', chain: 'jumbo', kinds: ['supermarkt', 'drogist', 'dierenwinkel', 'slijterij'], online: true, delivery_fee: 5.95, min_order: 50 },
];

/** Ketens waarvoor de server automatisch prijzen kan ophalen. */
export const AUTO_PRICE_CHAINS = ['ah', 'jumbo'] as const;
