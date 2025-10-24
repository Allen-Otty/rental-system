-- Supabase SQL schema for the rent app

create table if not exists public.properties (
  id text primary key,
  title text not null,
  price text,
  price_amount numeric,
  price_currency text,
  price_usd_approx numeric,
  bedrooms integer,
  bathrooms numeric,
  area numeric,
  description text,
  images jsonb,
  lat double precision,
  lon double precision,
  county text,
  address_formatted text,
  owner text,
  saved boolean default false,
  liked boolean default false,
  created_at timestamptz default now()
);

create index if not exists properties_county_idx on public.properties (county);
create index if not exists properties_owner_idx on public.properties (owner);
create index if not exists properties_lat_lon_idx on public.properties (lat, lon);

create table if not exists public.users (
  id text primary key,
  name text not null,
  email text unique,
  phone text,
  role text default 'user',
  created_at timestamptz default now()
);

create table if not exists public.saved_properties (
  user_id text not null,
  property_id text not null,
  created_at timestamptz default now(),
  primary key (user_id, property_id),
  constraint saved_properties_user_fk foreign key (user_id) references public.users(id) on delete cascade,
  constraint saved_properties_property_fk foreign key (property_id) references public.properties(id) on delete cascade
);

create table if not exists public.reviews (
  id text primary key,
  property_id text not null references public.properties(id),
  user_id text not null references public.users(id),
  rating integer check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz default now()
);

-- Enable RLS (recommended)
alter table public.properties enable row level security;
alter table public.users enable row level security;
alter table public.saved_properties enable row level security;
alter table public.reviews enable row level security;

-- Public read policies (adjust as required)
create policy if not exists "Public read properties" on public.properties for select using (true);
create policy if not exists "Public read users" on public.users for select using (true);
create policy if not exists "Public read saved_properties" on public.saved_properties for select using (true);
create policy if not exists "Public read reviews" on public.reviews for select using (true);

-- Authenticated insert/update policies (simplified; refine for production)
create policy if not exists "Authenticated insert properties" on public.properties for insert with check (true);
create policy if not exists "Authenticated update properties" on public.properties for update using (true);
create policy if not exists "Authenticated insert users" on public.users for insert with check (true);
create policy if not exists "Authenticated update users" on public.users for update using (true);
create policy if not exists "Authenticated insert saved" on public.saved_properties for insert with check (true);
create policy if not exists "Authenticated insert reviews" on public.reviews for insert with check (true);