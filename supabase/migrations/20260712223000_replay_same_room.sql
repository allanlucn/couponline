-- Allow the host to start another match with the same room and players.
create or replace function public.restart_game_state(
  p_room_id uuid,
  p_host_user_id uuid,
  p_expected_version bigint,
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
declare
  v_room public.rooms%rowtype;
  v_version bigint;
  v_new_version bigint;
  v_seq integer;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ROOM_NOT_FOUND';
  end if;
  if v_room.status <> 'finished' then
    raise exception using errcode = '55000', message = 'ROOM_NOT_FINISHED';
  end if;
  if not exists (
    select 1 from public.players
    where id = v_room.host_id and room_id = p_room_id and anon_user_id = p_host_user_id
  ) then
    raise exception using errcode = '42501', message = 'NOT_ROOM_HOST';
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

  if jsonb_typeof(p_canonical_state) <> 'object'
     or jsonb_typeof(p_public_state) <> 'object'
     or jsonb_typeof(p_players) <> 'array'
     or jsonb_typeof(p_hands) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_RESTART_PAYLOAD';
  end if;
  if p_public_state ?| array['deck','hands','cards','rngSeed','exchangeCards']
     or (jsonb_typeof(p_public_state -> 'pending') = 'object' and
         (p_public_state -> 'pending') ?| array['deck','hands','cards','rngSeed','exchangeCards']) then
    raise exception using errcode = '22023', message = 'PUBLIC_STATE_CONTAINS_SECRET';
  end if;
  if not exists (
    select 1 from public.players where id = p_current_player_id and room_id = p_room_id
  ) then
    raise exception using errcode = '23503', message = 'CURRENT_PLAYER_NOT_IN_ROOM';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_players) x
    where not exists (
      select 1 from public.players p where p.id = (x ->> 'id')::uuid and p.room_id = p_room_id
    )
  ) or exists (
    select 1 from jsonb_array_elements(p_hands) x
    where not exists (
      select 1 from public.players p where p.id = (x ->> 'player_id')::uuid and p.room_id = p_room_id
    )
  ) then
    raise exception using errcode = '23503', message = 'RESTART_PLAYER_NOT_IN_ROOM';
  end if;

  v_new_version := v_version + 1;
  update public.game_states
  set version = v_new_version, state = p_canonical_state, updated_at = now()
  where room_id = p_room_id;

  update public.rooms
  set status = 'playing', current_player_id = p_current_player_id, winner_id = null,
      state = p_public_state || jsonb_build_object('version', v_new_version), updated_at = now()
  where id = p_room_id;

  update public.players p
  set coins = (x.value ->> 'coins')::integer,
      is_alive = (x.value ->> 'is_alive')::boolean,
      revealed = coalesce(x.value -> 'revealed', '[]'::jsonb)
  from jsonb_array_elements(p_players) x(value)
  where p.id = (x.value ->> 'id')::uuid and p.room_id = p_room_id;

  insert into public.hands(player_id, anon_user_id, cards, pending_cards)
  select p.id, p.anon_user_id, coalesce(x.value -> 'cards', '[]'::jsonb),
         coalesce(x.value -> 'pending_cards', '[]'::jsonb)
  from jsonb_array_elements(p_hands) x(value)
  join public.players p on p.id = (x.value ->> 'player_id')::uuid and p.room_id = p_room_id
  on conflict(player_id) do update
  set cards = excluded.cards, pending_cards = excluded.pending_cards,
      anon_user_id = excluded.anon_user_id;

  select coalesce(max(seq), 0) + 1 into v_seq
  from public.events where room_id = p_room_id;
  insert into public.events(room_id, seq, type, payload)
  values (
    p_room_id,
    v_seq,
    coalesce(p_event ->> 'type', 'game_restarted'),
    coalesce(p_event -> 'payload', '{}'::jsonb)
  );

  return jsonb_build_object('committed', true, 'version', v_new_version);
end
$$;

revoke all on function public.restart_game_state(uuid,uuid,bigint,jsonb,jsonb,uuid,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.restart_game_state(uuid,uuid,bigint,jsonb,jsonb,uuid,jsonb,jsonb,jsonb)
  to service_role;
