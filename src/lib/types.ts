export interface Household {
  id: string;
  name: string;
  join_code: string;
  settings: Settings;
}

export interface Settings {
  mode?: 'cheapest' | 'selection' | 'single';
  selection?: string[];      // winkel-id's
  single?: string;           // winkel-id
  extraStorePenalty?: number;
  showChecked?: boolean;
}

export interface Store {
  id: string;
  household_id: string;
  name: string;
  chain: string | null;
  kinds: string[];
  location: string | null;
  online: boolean;
  delivery_fee: number;
  min_order: number;
  enabled: boolean;
  sort: number;
}

export interface Item {
  id: string;
  household_id: string;
  name: string;
  quantity: number;
  unit: string | null;
  note: string | null;
  category: string;
  store_id: string | null;
  pinned: { chain?: string; store_id?: string; product_id: string; title: string } | null;
  checked: boolean;
  wait_offer: boolean;
  target_price: number | null;
  added_by: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface PriceRow {
  id: string;
  household_id: string | null;
  chain: string | null;
  store_id: string | null;
  query: string;
  product_id: string;
  title: string;
  size: string | null;
  price: number;
  base_price: number | null;
  mechanic: string | null;
  offer_until: string | null;
  online_only: boolean;
  image_url: string | null;
  url: string | null;
  rank: number;
  fetched_at: string;
}
