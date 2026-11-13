-- Boodschappen-app database
-- Wordt bij elke deploy automatisch uitgevoerd (scripts/migrate.mjs) en mag dus vaker draaien.
-- Handmatig kan ook: plak dit hele bestand in Supabase → SQL Editor → Run.

create extension if not exists pgcrypto;

-- Een huishouden (jullie samen). Wie de code weet, kan meedoen.
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Ons huishouden',
  join_code text not null unique default upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6)),
  -- instellingen: modus, gekozen winkels, "wat is een extra winkel je waard"
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'Ik',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Winkels van het huishouden (standaardset wordt aangemaakt, zelf aan te vullen)
create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  chain text,                       -- 'ah', 'jumbo', 'lidl', ... (koppeling met prijsbron)
  kinds text[] not null default '{}', -- 'supermarkt', 'drogist', 'slager', ...
  location text,
  online boolean not null default false,
  delivery_fee numeric not null default 0,
  min_order numeric not null default 0,
  enabled boolean not null default true,
  sort int not null default 0
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  quantity numeric not null default 1,
  unit text,
  note text,
  category text not null default 'overig',
  store_id uuid references stores(id) on delete set null, -- handmatig vastgezette winkel
  pinned jsonb,                     -- gekozen product {chain, product_id, title}
  checked boolean not null default false,
  added_by text,
  source text,                      -- 'recept: Lasagne', 'geplakt', ...
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists items_household on items(household_id);

-- Wachtlijst: producten die pas op de lijst komen als ze in de aanbieding zijn (of onder een richtprijs)
alter table items add column if not exists wait_offer boolean not null default false;
alter table items add column if not exists target_price numeric;

-- Prijzen. household_id = null → automatisch opgehaald (voor iedereen),
-- household_id gezet → zelf ingevuld (slager, bakker, ...)
create table if not exists prices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  chain text,                       -- bij automatische prijzen
  store_id uuid references stores(id) on delete cascade, -- bij handmatige prijzen
  query text not null,              -- genormaliseerde zoekterm, bv. 'halfvolle melk'
  product_id text not null,
  title text not null,
  size text,
  price numeric not null,           -- huidige prijs per stuk (incl. eenvoudige korting)
  base_price numeric,               -- prijs zonder aanbieding
  mechanic text,                    -- '1+1 gratis', '2e halve prijs', '3 voor 5,00', ...
  offer_until date,
  online_only boolean not null default false,
  image_url text,
  url text,
  rank int not null default 0,       -- positie in zoekresultaat (0 = meest relevant)
  fetched_at timestamptz not null default now()
);
-- Later toegevoegd: hoe goed het product bij de zoekterm past (0 = titel, 1 = categorie, 2 = deels, 3 = twijfel)
-- en vanaf wanneer een actie geldt (kan in de toekomst liggen: "vanaf maandag in de bonus").
alter table prices add column if not exists match smallint;
alter table prices add column if not exists offer_from date;

create unique index if not exists prices_auto_unique on prices(chain, query, product_id) where household_id is null;
create unique index if not exists prices_manual_unique on prices(household_id, store_id, query) where household_id is not null;
create index if not exists prices_query on prices(query);

-- ---------- Beveiliging (Row Level Security) ----------
alter table households enable row level security;
alter table members enable row level security;
alter table stores enable row level security;
alter table items enable row level security;
alter table prices enable row level security;

create or replace function is_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from members where household_id = h and user_id = auth.uid());
$$;

drop policy if exists "hh read" on households;
create policy "hh read" on households for select using (is_member(id));
drop policy if exists "hh update" on households;
create policy "hh update" on households for update using (is_member(id));

drop policy if exists "members read" on members;
create policy "members read" on members for select using (is_member(household_id));
drop policy if exists "members self update" on members;
create policy "members self update" on members for update using (user_id = auth.uid());

drop policy if exists "stores all" on stores;
create policy "stores all" on stores for all using (is_member(household_id)) with check (is_member(household_id));

drop policy if exists "items all" on items;
create policy "items all" on items for all using (is_member(household_id)) with check (is_member(household_id));

drop policy if exists "prices read" on prices;
create policy "prices read" on prices for select using (household_id is null or is_member(household_id));
drop policy if exists "prices manual write" on prices;
create policy "prices manual write" on prices for all
  using (household_id is not null and is_member(household_id))
  with check (household_id is not null and is_member(household_id));

-- ---------- Huishouden aanmaken / meedoen ----------
create or replace function create_household(p_name text, p_display_name text)
returns households language plpgsql security definer set search_path = public as $$
declare h households;
begin
  if auth.uid() is null then raise exception 'niet ingelogd'; end if;
  insert into households(name) values (coalesce(nullif(p_name, ''), 'Ons huishouden')) returning * into h;
  insert into members(household_id, user_id, display_name) values (h.id, auth.uid(), coalesce(nullif(p_display_name, ''), 'Ik'));
  return h;
end $$;

create or replace function join_household(p_code text, p_display_name text)
returns households language plpgsql security definer set search_path = public as $$
declare h households;
begin
  if auth.uid() is null then raise exception 'niet ingelogd'; end if;
  select * into h from households where join_code = upper(trim(p_code));
  if h.id is null then raise exception 'Onbekende code'; end if;
  insert into members(household_id, user_id, display_name)
    values (h.id, auth.uid(), coalesce(nullif(p_display_name, ''), 'Ik'))
    on conflict (household_id, user_id) do update set display_name = excluded.display_name;
  return h;
end $$;

grant execute on function create_household(text, text) to authenticated;
grant execute on function join_household(text, text) to authenticated;

-- updated_at bijhouden
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists items_touch on items;
create trigger items_touch before update on items for each row execute function touch_updated_at();

-- Realtime aanzetten voor de lijst (zodat jullie elkaars wijzigingen direct zien)
do $$ begin
  alter publication supabase_realtime add table items;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table stores;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table prices;
exception when duplicate_object then null; end $$;
