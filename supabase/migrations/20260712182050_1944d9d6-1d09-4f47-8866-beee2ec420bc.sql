
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  status text not null default 'lobby',
  host_id uuid,
  current_player_id uuid,
  state jsonb not null default '{}'::jsonb,
  winner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  anon_user_id uuid not null,
  name text not null,
  seat int not null,
  coins int not null default 2,
  is_alive boolean not null default true,
  revealed jsonb not null default '[]'::jsonb,
  joined_at timestamptz not null default now(),
  unique(room_id, seat)
);

create table public.hands (
  player_id uuid primary key references public.players(id) on delete cascade,
  anon_user_id uuid not null,
  cards jsonb not null default '[]'::jsonb
);

create table public.events (
  id bigserial primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  seq int not null,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index events_room_seq on public.events(room_id, seq);

grant select on public.rooms to anon, authenticated;
grant select on public.players to anon, authenticated;
grant select on public.events to anon, authenticated;
grant select on public.hands to authenticated;
grant all on public.rooms to service_role;
grant all on public.players to service_role;
grant all on public.hands to service_role;
grant all on public.events to service_role;
grant usage, select on sequence public.events_id_seq to service_role;

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.hands enable row level security;
alter table public.events enable row level security;

create policy "rooms readable" on public.rooms for select using (true);
create policy "players readable" on public.players for select using (true);
create policy "events readable" on public.events for select using (true);
create policy "own hand readable" on public.hands for select
  to authenticated using (anon_user_id = auth.uid());

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.events;
