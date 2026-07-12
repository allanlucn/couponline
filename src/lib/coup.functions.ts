import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { reduce, startGame, type FullState, type FullPlayer, type Action } from "@/game/engine";
import type { Character } from "@/game/types";

// Deterministic short-code generator (no ambiguous chars)
function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 6; i++) c += alphabet[Math.floor(Math.random() * alphabet.length)];
  return c;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// ---------- CREATE ROOM ----------
export const createRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; actionTimeoutSeconds: number }) =>
    z
      .object({
        name: z.string().min(1).max(24),
        actionTimeoutSeconds: z.number().int().min(20).max(60),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supa = await admin();
    // try a few codes until unique
    let code = "";
    for (let i = 0; i < 6; i++) {
      code = makeCode();
      const { data: exists } = await supa.from("rooms").select("id").eq("code", code).maybeSingle();
      if (!exists) break;
    }
    const { data: room, error } = await supa
      .from("rooms")
      .insert({ code, status: "lobby", state: { actionTimeoutSeconds: data.actionTimeoutSeconds } })
      .select()
      .single();
    if (error) throw new Error(error.message);
    const { data: player, error: pe } = await supa
      .from("players")
      .insert({
        room_id: room.id,
        anon_user_id: context.userId,
        name: data.name,
        seat: 0,
      })
      .select()
      .single();
    if (pe) throw new Error(pe.message);
    await supa.from("rooms").update({ host_id: player.id }).eq("id", room.id);
    return { code, roomId: room.id, playerId: player.id };
  });

// ---------- JOIN ROOM ----------
export const joinRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string; name: string; existingPlayerId?: string }) =>
    z
      .object({
        code: z.string().min(4).max(8),
        name: z.string().min(1).max(24),
        existingPlayerId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supa = await admin();
    const code = data.code.toUpperCase();
    const { data: room } = await supa.from("rooms").select("*").eq("code", code).maybeSingle();
    if (!room) throw new Error("Sala não encontrada");
    // já entrou antes? (mesmo anon)
    if (data.existingPlayerId) {
      const { data: existing } = await supa
        .from("players")
        .select("*")
        .eq("id", data.existingPlayerId)
        .eq("room_id", room.id)
        .eq("anon_user_id", context.userId)
        .maybeSingle();
      if (existing) return { code, roomId: room.id, playerId: existing.id };
    }
    if (room.status !== "lobby") throw new Error("Partida já começou");
    const { data: seats } = await supa.from("players").select("seat").eq("room_id", room.id);
    const nextSeat = seats?.length ?? 0;
    if (nextSeat >= 6) throw new Error("Sala cheia");
    const { data: player, error } = await supa
      .from("players")
      .insert({ room_id: room.id, anon_user_id: context.userId, name: data.name, seat: nextSeat })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { code, roomId: room.id, playerId: player.id };
  });

export const updateRoomTimeout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string; actionTimeoutSeconds: number }) =>
    z
      .object({ roomId: z.string().uuid(), actionTimeoutSeconds: z.number().int().min(20).max(60) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supa = await admin();
    const { data: room } = await supa.from("rooms").select("*").eq("id", data.roomId).single();
    if (!room || room.status !== "lobby") throw new Error("O tempo só pode ser alterado no lobby");
    if (!room.host_id) throw new Error("A sala ainda não possui um host");
    const { data: host } = await supa
      .from("players")
      .select("anon_user_id")
      .eq("id", room.host_id)
      .single();
    if (host?.anon_user_id !== context.userId)
      throw new Error("Apenas o host pode alterar o tempo");
    const state = (room.state ?? {}) as Record<string, unknown>;
    await supa
      .from("rooms")
      .update({ state: { ...state, actionTimeoutSeconds: data.actionTimeoutSeconds } })
      .eq("id", data.roomId);
    return { ok: true };
  });

// ---------- LOAD FULL STATE (server-side only) ----------
async function loadFullState(roomId: string): Promise<{ room: any; state: FullState }> {
  const supa = await admin();
  const { data: roomRaw } = await supa.from("rooms").select("*").eq("id", roomId).single();
  const room = roomRaw as any;
  if (!room) throw new Error("Sala não existe");
  const { data: players } = await supa
    .from("players")
    .select("*")
    .eq("room_id", roomId)
    .order("seat");
  const { data: hands } = await supa
    .from("hands")
    .select("*")
    .in(
      "player_id",
      (players ?? []).map((p: any) => p.id),
    );
  const handMap = new Map<string, Character[]>();
  for (const h of hands ?? []) handMap.set(h.player_id, h.cards as Character[]);
  const state = (room.state ?? {}) as any;
  const full: FullState = {
    status: room.status as FullState["status"],
    players: (players ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      coins: p.coins,
      isAlive: p.is_alive,
      hand: handMap.get(p.id) ?? [],
      revealed: (p.revealed as Character[]) ?? [],
    })),
    deck: (state.deck as Character[]) ?? [],
    currentPlayerId: room.current_player_id ?? undefined,
    pending: state.pending ?? undefined,
    winnerId: room.winner_id ?? undefined,
    rngSeed: state.rngSeed ?? 0,
    actionTimeoutSeconds: state.actionTimeoutSeconds ?? 20,
    deadlineAt: state.deadlineAt ?? undefined,
  };

  return { room, state: full };
}

async function persistState(
  roomId: string,
  prev: FullState,
  next: FullState,
  events: { type: string; payload: any }[],
) {
  const supa = await admin();
  // rooms
  await supa
    .from("rooms")
    .update({
      status: next.status,
      current_player_id: next.currentPlayerId ?? null,
      winner_id: next.winnerId ?? null,
      state: {
        deck: next.deck,
        pending: next.pending,
        rngSeed: next.rngSeed,
        actionTimeoutSeconds: next.actionTimeoutSeconds,
        deadlineAt: next.deadlineAt,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", roomId);
  // players (only changed fields to reduce churn — but simplest to upsert)
  for (const p of next.players) {
    const before = prev.players.find((x) => x.id === p.id);
    if (
      !before ||
      before.coins !== p.coins ||
      before.isAlive !== p.isAlive ||
      before.revealed.length !== p.revealed.length
    ) {
      await supa
        .from("players")
        .update({ coins: p.coins, is_alive: p.isAlive, revealed: p.revealed })
        .eq("id", p.id);
    }
    if (!before || before.hand.join(",") !== p.hand.join(",")) {
      // update hand (upsert)
      await supa.from("hands").upsert({
        player_id: p.id,
        anon_user_id: (await supa.from("players").select("anon_user_id").eq("id", p.id).single())
          .data!.anon_user_id,
        cards: p.hand,
      });
    }
  }
  // events
  const { data: last } = await supa
    .from("events")
    .select("seq")
    .eq("room_id", roomId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  let seq = (last?.seq ?? 0) + 1;
  if (events.length) {
    await supa
      .from("events")
      .insert(
        events.map((e) => ({ room_id: roomId, seq: seq++, type: e.type, payload: e.payload })),
      );
  }
}

// ---------- START GAME ----------
export const startGameFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { roomId: string }) => z.object({ roomId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supa = await admin();
    const { data: room } = await supa.from("rooms").select("*").eq("id", data.roomId).single();
    if (!room) throw new Error("Sala não existe");
    if (!room.host_id) throw new Error("Sala sem host");
    const { data: hostPlayer } = await supa
      .from("players")
      .select("*")
      .eq("id", room.host_id)
      .single();
    if (!hostPlayer || hostPlayer.anon_user_id !== context.userId)
      throw new Error("Apenas o host inicia");
    if (room.status !== "lobby") throw new Error("Já iniciou");
    const { data: players } = await supa
      .from("players")
      .select("*")
      .eq("room_id", data.roomId)
      .order("seat");
    if (!players || players.length < 2) throw new Error("Mínimo 2 jogadores");
    const seed = Math.floor(Math.random() * 1_000_000_000);
    const roomState = (room.state ?? {}) as { actionTimeoutSeconds?: number };
    const actionTimeoutSeconds = Math.min(60, Math.max(20, roomState.actionTimeoutSeconds ?? 20));
    const state = startGame(
      players.map((p: any) => ({ id: p.id, name: p.name, seat: p.seat })),
      seed,
      actionTimeoutSeconds,
    );
    state.deadlineAt = new Date(Date.now() + actionTimeoutSeconds * 1000).toISOString();
    // persist hands
    for (const p of state.players) {
      await supa.from("hands").upsert({
        player_id: p.id,
        anon_user_id: players.find((x: any) => x.id === p.id)!.anon_user_id,
        cards: p.hand,
      });
    }
    await supa
      .from("rooms")
      .update({
        status: "playing",
        current_player_id: state.currentPlayerId,
        state: {
          deck: state.deck,
          rngSeed: state.rngSeed,
          pending: null,
          actionTimeoutSeconds,
          deadlineAt: state.deadlineAt,
        },
      })
      .eq("id", data.roomId);
    await supa
      .from("events")
      .insert({ room_id: data.roomId, seq: 1, type: "game_started", payload: {} });
    return { ok: true };
  });

// ---------- APPLY ACTION ----------
export const applyAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        roomId: z.string().uuid(),
        action: z.any(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supa = await admin();
    // who is calling?
    const act = data.action as Action;
    // enforce identity: attach playerId from caller
    const identityFields: Record<string, string> = {
      action: "actorId",
      challenge: "challengerId",
      block: "blockerId",
      pass: "playerId",
      reveal: "playerId",
      exchange_return: "playerId",
    };
    const key = identityFields[(act as any).kind];
    const claimedPlayerId = key ? (act as any)[key] : undefined;
    let callerQuery = supa
      .from("players")
      .select("*")
      .eq("room_id", data.roomId)
      .eq("anon_user_id", context.userId);
    if (claimedPlayerId) callerQuery = callerQuery.eq("id", claimedPlayerId);
    const { data: callers } = await callerQuery.limit(1);
    const caller = callers?.[0];
    if (!caller) throw new Error("Você não está na sala");
    if (key) (act as any)[key] = caller.id;

    const { state: prev } = await loadFullState(data.roomId);
    if (act.kind === "timeout") {
      if (
        !prev.deadlineAt ||
        act.deadlineAt !== prev.deadlineAt ||
        Date.now() < Date.parse(prev.deadlineAt)
      ) {
        return { ok: true };
      }
    }
    const { state: next, events } = reduce(prev, act);
    if (next.status === "playing") {
      next.deadlineAt = new Date(Date.now() + next.actionTimeoutSeconds * 1000).toISOString();
    } else {
      next.deadlineAt = undefined;
    }
    await persistState(data.roomId, prev, next, events);
    return { ok: true };
  });
