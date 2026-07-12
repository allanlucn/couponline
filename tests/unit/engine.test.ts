import { describe, expect, test } from "bun:test";

import { buildDeck, reduce, startGame, type FullState } from "../../src/game/engine";
import { CHARACTERS } from "../../src/game/types";

const players = [
  { id: "p1", name: "Ada", seat: 0 },
  { id: "p2", name: "Bia", seat: 1 },
  { id: "p3", name: "Caio", seat: 2 },
];

describe("Coup rules engine", () => {
  test("builds exactly three copies of every character", () => {
    const deck = buildDeck();

    expect(deck).toHaveLength(15);
    for (const character of CHARACTERS) {
      expect(deck.filter((card) => card === character)).toHaveLength(3);
    }
  });

  test("starts deterministically with unique dealt cards removed from the deck", () => {
    const first = startGame(players, 1234);
    const second = startGame(players, 1234);

    expect(first).toEqual(second);
    expect(first.players.map((player) => player.seat)).toEqual([0, 1, 2]);
    expect(first.players.every((player) => player.hand.length === 2)).toBe(true);
    expect(first.deck).toHaveLength(9);
    expect(first.currentPlayerId).toBe("p1");
  });

  test("serial application preserves two valid passes", () => {
    const started = startGame(players, 41);
    const declared = reduce(started, { kind: "action", type: "tax", actorId: "p1" }).state;
    const firstPass = reduce(declared, { kind: "pass", playerId: "p2" }).state;
    const secondPass = reduce(firstPass, { kind: "pass", playerId: "p3" }).state;

    expect(firstPass.pending?.passed).toEqual(["p2"]);
    expect(secondPass.pending).toBeUndefined();
    expect(secondPass.players.find((player) => player.id === "p1")?.coins).toBe(5);
    expect(secondPass.currentPlayerId).toBe("p2");
  });

  test("a repeated pass is idempotent in the same response window", () => {
    const started = startGame(players, 42);
    const declared = reduce(started, { kind: "action", type: "tax", actorId: "p1" }).state;
    const once = reduce(declared, { kind: "pass", playerId: "p2" });
    const twice = reduce(once.state, { kind: "pass", playerId: "p2" });

    expect(twice.state).toEqual(once.state);
    expect(twice.events).toEqual([]);
  });

  test("timeout advances a pending challenge exactly once at engine level", () => {
    const started = startGame(players, 43);
    const declared = reduce(started, { kind: "action", type: "tax", actorId: "p1" }).state;
    const timedOut = reduce(declared, { kind: "timeout", deadlineAt: "2026-07-12T12:00:00Z" });

    expect(timedOut.events.filter((event) => event.type === "timeout")).toHaveLength(1);
    expect(timedOut.state.pending).toBeUndefined();
    expect(timedOut.state.currentPlayerId).toBe("p2");
  });

  test("exchange cards remain in canonical state until the actor chooses", () => {
    const started = startGame(players, 44);
    const actor = started.players.find((player) => player.id === "p1")!;
    const forced: FullState = {
      ...started,
      players: started.players.map((player) =>
        player.id === actor.id ? { ...player, hand: ["ambassador", player.hand[1]] } : player,
      ),
    };
    const declared = reduce(forced, {
      kind: "action",
      type: "exchange",
      actorId: "p1",
    }).state;
    const afterPasses = reduce(reduce(declared, { kind: "pass", playerId: "p2" }).state, {
      kind: "pass",
      playerId: "p3",
    }).state;

    expect(afterPasses.pending?.phase).toBe("exchange_pick");
    expect(afterPasses.pending?.exchangeCards).toHaveLength(2);
    expect(afterPasses.deck).toHaveLength(started.deck.length - 2);
  });

  test("a replay resets every player while preserving room membership and seats", () => {
    const previous = startGame(players, 45);
    const replay = startGame(
      previous.players.map(({ id, name, seat }) => ({ id, name, seat })),
      46,
      35,
    );

    expect(replay.players.map(({ id, name, seat }) => ({ id, name, seat }))).toEqual(players);
    expect(replay.players.every((player) => player.coins === 2)).toBe(true);
    expect(replay.players.every((player) => player.isAlive && player.revealed.length === 0)).toBe(
      true,
    );
    expect(replay.players.every((player) => player.hand.length === 2)).toBe(true);
    expect(replay.winnerId).toBeUndefined();
    expect(replay.pending).toBeUndefined();
    expect(replay.actionTimeoutSeconds).toBe(35);
  });
});
