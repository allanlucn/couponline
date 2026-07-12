-- Multiplayer deploy hardening. This migration is deliberately additive so the
-- application can be rolled forward without recreating the alpha database.

do $$
begin
  if exists (
    select 1 from public.players
    group by room_id, anon_user_id having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Cannot add players_room_user_unique: duplicate (room_id, anon_user_id) rows exist. Clean disposable alpha data before db push.';
  end if;

  if exists (
    select 1 from public.events
    group by room_id, seq having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Cannot add events_room_seq_unique: duplicate (room_id, seq) rows exist. Clean disposable alpha data before db push.';
  end if;
end
$$;

alter table public.players
  add constraint players_room_user_unique unique (room_id, anon_user_id);

alter table public.events
  add constraint events_room_seq_unique unique (room_id, seq);

alter table public.hands
  add column pending_cards jsonb not null default '[]'::jsonb;

create table public.game_states (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.game_states enable row level security;
revoke all on table public.game_states from public, anon, authenticated;
grant all on table public.game_states to service_role;

-- Preserve active games created by the pre-hardening application before their
-- public room state is scrubbed. This keeps the migration safe for in-flight
-- alpha rooms while moving all secrets into the private canonical table.
insert into public.game_states(room_id, version, state)
select r.id, 1,
  jsonb_build_object(
    'status', r.status,
    'players', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'seat', p.seat,
          'coins', p.coins,
          'isAlive', p.is_alive,
          'hand', coalesce(h.cards, '[]'::jsonb),
          'revealed', p.revealed
        ) order by p.seat
      )
      from public.players p
      left join public.hands h on h.player_id = p.id
      where p.room_id = r.id
    ), '[]'::jsonb),
    'deck', coalesce(r.state -> 'deck', '[]'::jsonb),
    'currentPlayerId', to_jsonb(r.current_player_id),
    'pending', coalesce(r.state -> 'pending', 'null'::jsonb),
    'winnerId', to_jsonb(r.winner_id),
    'rngSeed', coalesce(r.state -> 'rngSeed', '0'::jsonb),
    'actionTimeoutSeconds', coalesce(r.state -> 'actionTimeoutSeconds', '20'::jsonb),
    'deadlineAt', coalesce(r.state -> 'deadlineAt', 'null'::jsonb)
  )
from public.rooms r
where r.status in ('playing', 'finished');

-- Remove secrets left by pre-hardening application versions. This intentionally
-- preserves all other public UI fields. New writes are additionally checked in
-- the RPCs below.
update public.rooms
set state = (state - 'deck' - 'hands' - 'cards' - 'rngSeed' - 'exchangeCards') ||
  jsonb_build_object('version', coalesce((
    select gs.version from public.game_states gs where gs.room_id = rooms.id
  ), 0)) ||
  case
    when jsonb_typeof(state -> 'pending') = 'object'
      then jsonb_build_object(
        'pending', (state -> 'pending') - 'deck' - 'hands' - 'cards' - 'rngSeed' - 'exchangeCards'
      )
    else '{}'::jsonb
  end,
  updated_at = now()
where state ?| array['deck', 'hands', 'cards', 'rngSeed', 'exchangeCards']
   or (jsonb_typeof(state -> 'pending') = 'object' and
       (state -> 'pending') ?| array['deck', 'hands', 'cards', 'rngSeed', 'exchangeCards']);

create or replace function public.commit_game_state(
  p_room_id uuid,
  p_expected_version bigint,
  p_canonical_state jsonb,
  p_public_state jsonb,
  p_status text,
  p_current_player_id uuid,
  p_winner_id uuid,
  p_players jsonb,
  p_hands jsonb,
  p_events jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version bigint;
  v_new_version bigint;
  v_event jsonb;
  v_seq integer;
begin
  if jsonb_typeof(p_canonical_state) <> 'object'
     or jsonb_typeof(p_public_state) <> 'object'
     or jsonb_typeof(p_players) <> 'array'
     or jsonb_typeof(p_hands) <> 'array'
     or jsonb_typeof(p_events) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_COMMIT_PAYLOAD';
  end if;

  if p_public_state ?| array['deck', 'hands', 'cards', 'rngSeed', 'exchangeCards']
     or (jsonb_typeof(p_public_state -> 'pending') = 'object' and
         (p_public_state -> 'pending') ?| array['deck', 'hands', 'cards', 'rngSeed', 'exchangeCards']) then
    raise exception using errcode = '22023', message = 'PUBLIC_STATE_CONTAINS_SECRET';
  end if;

  select version into v_version
  from public.game_states
  where room_id = p_room_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ROOM_NOT_STARTED';
  end if;

  if v_version <> p_expected_version then
    return jsonb_build_object('committed', false, 'version', v_version);
  end if;

  if p_current_player_id is not null and not exists (
    select 1 from public.players where id = p_current_player_id and room_id = p_room_id
  ) then raise exception using errcode = '23503', message = 'CURRENT_PLAYER_NOT_IN_ROOM'; end if;
  if p_winner_id is not null and not exists (
    select 1 from public.players where id = p_winner_id and room_id = p_room_id
  ) then raise exception using errcode = '23503', message = 'WINNER_NOT_IN_ROOM'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_players) x
    where not exists (
      select 1 from public.players p where p.id = (x ->> 'id')::uuid and p.room_id = p_room_id
    )
  ) then raise exception using errcode = '23503', message = 'PLAYER_NOT_IN_ROOM'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_hands) x
    where not exists (
      select 1 from public.players p where p.id = (x ->> 'player_id')::uuid and p.room_id = p_room_id
    )
  ) then raise exception using errcode = '23503', message = 'HAND_PLAYER_NOT_IN_ROOM'; end if;

  v_new_version := v_version + 1;
  update public.game_states
    set version = v_new_version, state = p_canonical_state, updated_at = now()
    where room_id = p_room_id;
  update public.rooms
    set state = p_public_state || jsonb_build_object('version', v_new_version),
        status = p_status, current_player_id = p_current_player_id,
        winner_id = p_winner_id, updated_at = now()
    where id = p_room_id;

  update public.players p
    set coins = (x.value ->> 'coins')::integer,
        is_alive = (x.value ->> 'is_alive')::boolean,
        revealed = coalesce(x.value -> 'revealed', '[]'::jsonb)
  from jsonb_array_elements(p_players) x(value)
  where p.id = (x.value ->> 'id')::uuid and p.room_id = p_room_id;

  insert into public.hands (player_id, anon_user_id, cards, pending_cards)
  select p.id, p.anon_user_id, coalesce(x.value -> 'cards', '[]'::jsonb),
         coalesce(x.value -> 'pending_cards', '[]'::jsonb)
  from jsonb_array_elements(p_hands) x(value)
  join public.players p on p.id = (x.value ->> 'player_id')::uuid and p.room_id = p_room_id
  on conflict (player_id) do update
    set cards = excluded.cards, pending_cards = excluded.pending_cards,
        anon_user_id = excluded.anon_user_id;

  select coalesce(max(seq), 0) into v_seq from public.events where room_id = p_room_id;
  for v_event in select value from jsonb_array_elements(p_events)
  loop
    v_seq := v_seq + 1;
    insert into public.events(room_id, seq, type, payload)
      values (p_room_id, v_seq, v_event ->> 'type', coalesce(v_event -> 'payload', '{}'::jsonb));
  end loop;

  return jsonb_build_object('committed', true, 'version', v_new_version);
end
$$;

create or replace function public.start_game_state(
  p_room_id uuid,
  p_host_user_id uuid,
  p_canonical_state jsonb,
  p_public_state jsonb,
  p_current_player_id uuid,
  p_players jsonb,
  p_hands jsonb,
  p_event jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'lobby' or exists (select 1 from public.game_states where room_id = p_room_id) then
    return jsonb_build_object('committed', false, 'version', coalesce((select version from public.game_states where room_id=p_room_id), 0));
  end if;
  if not exists (
    select 1 from public.players where id = v_room.host_id and room_id = p_room_id and anon_user_id = p_host_user_id
  ) then raise exception using errcode = '42501', message = 'NOT_ROOM_HOST'; end if;
  if jsonb_typeof(p_canonical_state) <> 'object' or jsonb_typeof(p_public_state) <> 'object'
     or jsonb_typeof(p_players) <> 'array' or jsonb_typeof(p_hands) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_START_PAYLOAD';
  end if;
  if p_public_state ?| array['deck','hands','cards','rngSeed','exchangeCards']
     or (jsonb_typeof(p_public_state -> 'pending') = 'object' and
         (p_public_state -> 'pending') ?| array['deck','hands','cards','rngSeed','exchangeCards']) then
    raise exception using errcode = '22023', message = 'PUBLIC_STATE_CONTAINS_SECRET';
  end if;
  if p_current_player_id is not null and not exists (
    select 1 from public.players where id=p_current_player_id and room_id=p_room_id
  ) then raise exception using errcode='23503', message='CURRENT_PLAYER_NOT_IN_ROOM'; end if;
  if exists (select 1 from jsonb_array_elements(p_players) x where not exists
    (select 1 from public.players p where p.id=(x->>'id')::uuid and p.room_id=p_room_id))
    or exists (select 1 from jsonb_array_elements(p_hands) x where not exists
    (select 1 from public.players p where p.id=(x->>'player_id')::uuid and p.room_id=p_room_id)) then
    raise exception using errcode='23503', message='START_PLAYER_NOT_IN_ROOM';
  end if;

  insert into public.game_states(room_id, version, state) values (p_room_id, 1, p_canonical_state);
  update public.rooms set status='playing', current_player_id=p_current_player_id,
    winner_id=null, state=p_public_state || jsonb_build_object('version', 1), updated_at=now()
    where id=p_room_id;
  update public.players p set coins=(x.value->>'coins')::integer,
    is_alive=(x.value->>'is_alive')::boolean, revealed=coalesce(x.value->'revealed','[]'::jsonb)
    from jsonb_array_elements(p_players) x(value)
    where p.id=(x.value->>'id')::uuid and p.room_id=p_room_id;
  insert into public.hands(player_id, anon_user_id, cards, pending_cards)
    select p.id,p.anon_user_id,coalesce(x.value->'cards','[]'::jsonb),coalesce(x.value->'pending_cards','[]'::jsonb)
    from jsonb_array_elements(p_hands) x(value)
    join public.players p on p.id=(x.value->>'player_id')::uuid and p.room_id=p_room_id
    on conflict(player_id) do update set cards=excluded.cards,
      pending_cards=excluded.pending_cards,anon_user_id=excluded.anon_user_id;
  insert into public.events(room_id,seq,type,payload)
    values(p_room_id,1,coalesce(p_event->>'type','game_started'),coalesce(p_event->'payload','{}'::jsonb));
  return jsonb_build_object('committed', true, 'version', 1);
end
$$;

create or replace function public.join_room_atomic(p_code text, p_user_id uuid, p_name text)
returns public.players
language plpgsql
security definer
set search_path = public
as $$
declare v_room public.rooms%rowtype; v_player public.players%rowtype; v_seat integer;
begin
  if p_user_id is null or nullif(btrim(p_name), '') is null then
    raise exception using errcode='22023', message='INVALID_JOIN_PAYLOAD';
  end if;
  select * into v_room from public.rooms where upper(code)=upper(btrim(p_code)) for update;
  if not found then raise exception using errcode='P0002', message='ROOM_NOT_FOUND'; end if;
  select * into v_player from public.players where room_id=v_room.id and anon_user_id=p_user_id;
  if found then return v_player; end if;
  if v_room.status <> 'lobby' then raise exception using errcode='55000', message='ROOM_ALREADY_STARTED'; end if;
  select s into v_seat from generate_series(0,5) s
    where not exists(select 1 from public.players p where p.room_id=v_room.id and p.seat=s)
    order by s limit 1;
  if v_seat is null then raise exception using errcode='54000', message='ROOM_FULL'; end if;
  insert into public.players(room_id,anon_user_id,name,seat)
    values(v_room.id,p_user_id,btrim(p_name),v_seat) returning * into v_player;
  return v_player;
end
$$;

revoke all on function public.commit_game_state(uuid,bigint,jsonb,jsonb,text,uuid,uuid,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.start_game_state(uuid,uuid,jsonb,jsonb,uuid,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.join_room_atomic(text,uuid,text) from public, anon, authenticated;
grant execute on function public.commit_game_state(uuid,bigint,jsonb,jsonb,text,uuid,uuid,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.start_game_state(uuid,uuid,jsonb,jsonb,uuid,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.join_room_atomic(text,uuid,text) to service_role;
