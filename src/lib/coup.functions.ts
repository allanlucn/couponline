import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { reduce, startGame, type Action, type FullState, type LogEvent } from "@/game/engine";
import type { PendingAction } from "@/game/types";

const characters = ["duke", "assassin", "captain", "ambassador", "contessa"] as const;
const actionTypes = [
  "income",
  "foreign_aid",
  "coup",
  "tax",
  "assassinate",
  "steal",
  "exchange",
] as const;

const actionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("action"),
    type: z.enum(actionTypes),
    actorId: z.string().uuid(),
    targetId: z.string().uuid().optional(),
  }),
  z.object({ kind: z.literal("challenge"), challengerId: z.string().uuid() }),
  z.object({
    kind: z.literal("block"),
    blockerId: z.string().uuid(),
    character: z.enum(characters),
  }),
  z.object({ kind: z.literal("pass"), playerId: z.string().uuid() }),
  z.object({
    kind: z.literal("reveal"),
    playerId: z.string().uuid(),
    character: z.enum(characters),
  }),
  z.object({
    kind: z.literal("exchange_return"),
    playerId: z.string().uuid(),
    keep: z.array(z.enum(characters)).min(1).max(2),
  }),
  z.object({ kind: z.literal("timeout"), deadlineAt: z.string().datetime() }),
]);

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
type PublicPendingAction = Omit<PendingAction, "exchangeCards">;
export type PublicRoomState = {
  pending?: PublicPendingAction;
  actionTimeoutSeconds: number;
  deadlineAt?: string;
  version: number;
};

function codedError(code: string, message = code): Error {
  return new Error(`${code}: ${message}`);
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function toPublicRoomState(state: FullState, version: number): PublicRoomState {
  const pending = state.pending ? { ...state.pending } : undefined;
  if (pending) delete (pending as Partial<PendingAction>).exchangeCards;
  return {
    pending,
    actionTimeoutSeconds: state.actionTimeoutSeconds,
    deadlineAt: state.deadlineAt,
    version,
  };
}

function playerRows(state: FullState) {
  return state.players.map((player) => ({
    id: player.id,
    coins: player.coins,
    is_alive: player.isAlive,
    revealed: player.revealed,
  }));
}

function handRows(state: FullState) {
  const exchangeActor =
    state.pending?.phase === "exchange_pick" ? state.pending.actorId : undefined;
  const pendingCards =
    state.pending?.phase === "exchange_pick" ? (state.pending.exchangeCards ?? []) : [];
  return state.players.map((player) => ({
    player_id: player.id,
    cards: player.hand,
    pending_cards: player.id === exchangeActor ? pendingCards : [],
  }));
}

function eventRows(events: LogEvent[]) {
  return events.map(({ type, payload }) => ({ type, payload }));
}

function rpcResult(data: unknown): { committed: boolean; version: number } {
  const value = (Array.isArray(data) ? data[0] : data) as {
    committed?: boolean;
    version?: number;
  } | null;
  return { committed: value?.committed === true, version: Number(value?.version ?? 0) };
}

export const createRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string; actionTimeoutSeconds: number }) =>
    z
      .object({
        name: z.string().trim().min(1).max(24),
        actionTimeoutSeconds: z.number().int().min(20).max(60),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const supa = await admin();
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = makeCode();
      const { data: room, error } = await supa
        .from("rooms")
        .insert({
          code,
          status: "lobby",
          state: { actionTimeoutSeconds: data.actionTimeoutSeconds, version: 0 },
        })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") continue;
        throw new Error(error.message);
      }
      const { data: player, error: playerError } = await supa
        .from("players")
        .insert({
          room_id: room.id,
          anon_user_id: context.userId,
          name: data.name,
          seat: 0,
        })
        .select()
        .single();
      if (playerError) throw new Error(playerError.message);
      const { error: hostError } = await supa
        .from("rooms")
        .update({ host_id: player.id })
        .eq("id", room.id);
      if (hostError) throw new Error(hostError.message);
      return { code, roomId: room.id, playerId: player.id };
    }
    throw codedError("ROOM_CODE_EXHAUSTED", "Não foi possível gerar um código de sala único");
  });

export const joinRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { code: string; name: string; existingPlayerId?: string }) =>
    z
      .object({
        code: z.string().min(4).max(8),
        name: z.string().trim().min(1).max(24),
        existingPlayerId: z.string().uuid().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const supa = await admin();
    const { data: result, error } = await (supa as unknown as RpcClient).rpc("join_room_atomic", {
      p_code: data.code.toUpperCase(),
      p_user_id: context.userId,
      p_name: data.name,
    });
    if (error) {
      const known = ["ROOM_NOT_FOUND", "ROOM_FULL", "ROOM_ALREADY_STARTED"].find((code) =>
        error.message.includes(code),
      );
      throw codedError(known ?? "JOIN_FAILED", error.message);
    }
    const player = (Array.isArray(result) ? result[0] : result) as {
      id: string;
      room_id: string;
    } | null;
    if (!player) throw codedError("JOIN_FAILED");
    return { code: data.code.toUpperCase(), roomId: player.room_id, playerId: player.id };
  });

export const updateRoomTimeout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string; actionTimeoutSeconds: number }) =>
    z
      .object({ roomId: z.string().uuid(), actionTimeoutSeconds: z.number().int().min(20).max(60) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const supa = await admin();
    const { data: room } = await supa
      .from("rooms")
      .select("host_id,status,state")
      .eq("id", data.roomId)
      .maybeSingle();
    if (!room) throw codedError("ROOM_NOT_FOUND");
    if (room.status !== "lobby") throw codedError("ROOM_ALREADY_STARTED");
    const { data: host } = await supa
      .from("players")
      .select("anon_user_id")
      .eq("id", room.host_id ?? "")
      .eq("room_id", data.roomId)
      .maybeSingle();
    if (host?.anon_user_id !== context.userId)
      throw codedError("NOT_ROOM_MEMBER", "Apenas o host pode alterar o tempo");
    const state = (room.state ?? {}) as Record<string, unknown>;
    const { error } = await supa
      .from("rooms")
      .update({ state: { ...state, actionTimeoutSeconds: data.actionTimeoutSeconds } })
      .eq("id", data.roomId)
      .eq("status", "lobby");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function loadCanonicalState(roomId: string): Promise<{ state: FullState; version: number }> {
  const supa = await admin();
  const { data, error } = await (supa as any)
    .from("game_states")
    .select("state,version")
    .eq("room_id", roomId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw codedError("ROOM_NOT_FOUND", "Partida não iniciada");
  return { state: data.state as unknown as FullState, version: Number(data.version) };
}

export const startGameFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string }) => z.object({ roomId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const startedAt = Date.now();
    const supa = await admin();
    const { data: room } = await supa
      .from("rooms")
      .select("state")
      .eq("id", data.roomId)
      .maybeSingle();
    if (!room) throw codedError("ROOM_NOT_FOUND");
    const { data: players } = await supa
      .from("players")
      .select("id,name,seat")
      .eq("room_id", data.roomId)
      .order("seat");
    if (!players || players.length < 2) throw codedError("INVALID_ACTION", "Mínimo de 2 jogadores");
    const timeout = Math.min(
      60,
      Math.max(20, Number((room.state as Record<string, unknown>)?.actionTimeoutSeconds ?? 20)),
    );
    const state = startGame(players, Math.floor(Math.random() * 1_000_000_000), timeout);
    state.deadlineAt = new Date(Date.now() + timeout * 1000).toISOString();
    const { data: result, error } = await (supa as unknown as RpcClient).rpc("start_game_state", {
      p_room_id: data.roomId,
      p_host_user_id: context.userId,
      p_canonical_state: state,
      p_public_state: toPublicRoomState(state, 1),
      p_current_player_id: state.currentPlayerId,
      p_players: playerRows(state),
      p_hands: handRows(state),
      p_event: { type: "game_started", payload: {} },
    });
    if (error) {
      const known = [
        "ROOM_NOT_FOUND",
        "ROOM_ALREADY_STARTED",
        "NOT_ROOM_MEMBER",
        "INVALID_ACTION",
      ].find((code) => error.message.includes(code));
      throw codedError(known ?? "START_FAILED", error.message);
    }
    const commit = rpcResult(result);
    console.info(
      JSON.stringify({
        roomId: data.roomId,
        actionKind: "start",
        callerPlayerId: null,
        expectedVersion: 0,
        result: commit.committed ? "committed" : "conflict",
        durationMs: Date.now() - startedAt,
      }),
    );
    if (!commit.committed) throw codedError("ROOM_ALREADY_STARTED");
    return { ok: true, version: commit.version };
  });

export const restartGameFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string }) => z.object({ roomId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const startedAt = Date.now();
    const supa = await admin();
    const { data: room } = await supa
      .from("rooms")
      .select("state,status")
      .eq("id", data.roomId)
      .maybeSingle();
    if (!room) throw codedError("ROOM_NOT_FOUND");
    if (room.status !== "finished") {
      throw codedError("INVALID_ACTION", "A partida ainda não terminou");
    }
    const { data: canonical } = await supa
      .from("game_states")
      .select("version")
      .eq("room_id", data.roomId)
      .maybeSingle();
    if (!canonical) throw codedError("ROOM_NOT_FOUND", "Estado da partida não encontrado");
    const { data: players } = await supa
      .from("players")
      .select("id,name,seat")
      .eq("room_id", data.roomId)
      .order("seat");
    if (!players || players.length < 2) {
      throw codedError("INVALID_ACTION", "Mínimo de 2 jogadores");
    }

    const timeout = Math.min(
      60,
      Math.max(20, Number((room.state as Record<string, unknown>)?.actionTimeoutSeconds ?? 20)),
    );
    const state = startGame(players, Math.floor(Math.random() * 1_000_000_000), timeout);
    state.deadlineAt = new Date(Date.now() + timeout * 1000).toISOString();
    const expectedVersion = Number(canonical.version);
    const { data: result, error } = await (supa as unknown as RpcClient).rpc("restart_game_state", {
      p_room_id: data.roomId,
      p_host_user_id: context.userId,
      p_expected_version: expectedVersion,
      p_canonical_state: state,
      p_public_state: toPublicRoomState(state, expectedVersion + 1),
      p_current_player_id: state.currentPlayerId,
      p_players: playerRows(state),
      p_hands: handRows(state),
      p_event: { type: "game_restarted", payload: {} },
    });
    if (error) {
      const known = ["ROOM_NOT_FOUND", "ROOM_NOT_FINISHED", "NOT_ROOM_HOST"].find((code) =>
        error.message.includes(code),
      );
      throw codedError(known ?? "RESTART_FAILED", error.message);
    }
    const commit = rpcResult(result);
    console.info(
      JSON.stringify({
        roomId: data.roomId,
        actionKind: "restart",
        callerPlayerId: null,
        expectedVersion,
        result: commit.committed ? "committed" : "conflict",
        durationMs: Date.now() - startedAt,
      }),
    );
    if (!commit.committed) throw codedError("ACTION_CONFLICT");
    return { ok: true, version: commit.version };
  });

export const applyAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ roomId: z.string().uuid(), action: actionSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const startedAt = Date.now();
    const supa = await admin();
    const { data: caller } = await supa
      .from("players")
      .select("id")
      .eq("room_id", data.roomId)
      .eq("anon_user_id", context.userId)
      .maybeSingle();
    if (!caller) throw codedError("NOT_ROOM_MEMBER");
    const identityFields = {
      action: "actorId",
      challenge: "challengerId",
      block: "blockerId",
      pass: "playerId",
      reveal: "playerId",
      exchange_return: "playerId",
    } as const;
    const action = { ...data.action } as Action;
    const identityKey = action.kind === "timeout" ? undefined : identityFields[action.kind];
    if (identityKey) (action as unknown as Record<string, unknown>)[identityKey] = caller.id;

    for (let attempt = 0; attempt < 3; attempt++) {
      const { state: previous, version } = await loadCanonicalState(data.roomId);
      if (
        action.kind === "timeout" &&
        (!previous.deadlineAt ||
          action.deadlineAt !== previous.deadlineAt ||
          Date.now() < Date.parse(previous.deadlineAt))
      ) {
        return { ok: true, ignored: true, version };
      }
      let next: FullState;
      let events: LogEvent[];
      try {
        ({ state: next, events } = reduce(previous, action));
      } catch (error) {
        throw codedError(
          "INVALID_ACTION",
          error instanceof Error ? error.message : "Ação inválida",
        );
      }
      next.deadlineAt =
        next.status === "playing"
          ? new Date(Date.now() + next.actionTimeoutSeconds * 1000).toISOString()
          : undefined;
      const { data: result, error } = await (supa as unknown as RpcClient).rpc(
        "commit_game_state",
        {
          p_room_id: data.roomId,
          p_expected_version: version,
          p_canonical_state: next,
          p_public_state: toPublicRoomState(next, version + 1),
          p_status: next.status,
          p_current_player_id: next.currentPlayerId ?? null,
          p_winner_id: next.winnerId ?? null,
          p_players: playerRows(next),
          p_hands: handRows(next),
          p_events: eventRows(events),
        },
      );
      if (error) throw new Error(error.message);
      const commit = rpcResult(result);
      console.info(
        JSON.stringify({
          roomId: data.roomId,
          actionKind: action.kind,
          callerPlayerId: caller.id,
          expectedVersion: version,
          result: commit.committed ? "committed" : "conflict",
          durationMs: Date.now() - startedAt,
        }),
      );
      if (commit.committed) return { ok: true, version: commit.version };
    }
    throw codedError(
      "ACTION_CONFLICT",
      "A sala mudou enquanto a ação era processada; tente novamente",
    );
  });
