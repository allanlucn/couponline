// Pure Coup rules engine.
import {
  CHARACTERS,
  ACTION_META,
  type ActionType,
  type Character,
  type PendingAction,
} from "./types";

export type FullPlayer = {
  id: string;
  name: string;
  seat: number;
  coins: number;
  isAlive: boolean;
  hand: Character[];
  revealed: Character[];
};

export type FullState = {
  status: "lobby" | "playing" | "finished";
  players: FullPlayer[];
  deck: Character[];
  currentPlayerId?: string;
  pending?: PendingAction;
  winnerId?: string;
  rngSeed: number;
  actionTimeoutSeconds: number;
  deadlineAt?: string;
};

export type LogEvent = { type: string; payload: Record<string, unknown> };

export const MAX_COPIES_PER_CHARACTER = 3;

function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) % 100000) / 100000;
  };
}
export function shuffle<T>(arr: T[], seed: number): T[] {
  const rand = seededRandom(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildDeck(): Character[] {
  const deck = CHARACTERS.flatMap((character) =>
    Array.from({ length: MAX_COPIES_PER_CHARACTER }, () => character),
  );

  for (const character of CHARACTERS) {
    const copies = deck.filter((card) => card === character).length;
    if (copies > MAX_COPIES_PER_CHARACTER) {
      throw new Error(
        `Baralho inválido: mais de ${MAX_COPIES_PER_CHARACTER} cópias de ${character}`,
      );
    }
  }

  return deck;
}

export function startGame(
  players: { id: string; name: string; seat: number }[],
  seed: number,
  actionTimeoutSeconds = 20,
): FullState {
  const deck = shuffle(buildDeck(), seed);
  const filled: FullPlayer[] = players.map((p) => ({
    ...p,
    coins: 2,
    isAlive: true,
    revealed: [],
    hand: [deck.pop()!, deck.pop()!],
  }));
  return {
    status: "playing",
    players: filled.sort((a, b) => a.seat - b.seat),
    deck,
    currentPlayerId: filled[0].id,
    rngSeed: seed,
    actionTimeoutSeconds,
  };
}

const getP = (s: FullState, id: string) => s.players.find((p) => p.id === id)!;

function nextAliveSeat(s: FullState, fromId: string): string {
  const idx = s.players.findIndex((p) => p.id === fromId);
  for (let i = 1; i <= s.players.length; i++) {
    const p = s.players[(idx + i) % s.players.length];
    if (p.isAlive) return p.id;
  }
  return fromId;
}

function checkWinner(s: FullState): FullState {
  const alive = s.players.filter((p) => p.isAlive);
  if (alive.length === 1 && s.status === "playing") {
    return {
      ...s,
      status: "finished",
      winnerId: alive[0].id,
      currentPlayerId: undefined,
      pending: undefined,
    };
  }
  return s;
}

function replaceCard(s: FullState, playerId: string, character: Character): FullState {
  const p = getP(s, playerId);
  const idx = p.hand.indexOf(character);
  if (idx < 0) return s;
  const deck = shuffle([...s.deck, character], s.rngSeed + s.deck.length);
  const newCard = deck.pop()!;
  const newHand = [...p.hand];
  newHand[idx] = newCard;
  return {
    ...s,
    deck,
    players: s.players.map((pp) => (pp.id === playerId ? { ...pp, hand: newHand } : pp)),
  };
}

export type Action =
  | { kind: "action"; type: ActionType; actorId: string; targetId?: string }
  | { kind: "challenge"; challengerId: string }
  | { kind: "block"; blockerId: string; character: Character }
  | { kind: "pass"; playerId: string }
  | { kind: "reveal"; playerId: string; character: Character }
  | { kind: "exchange_return"; playerId: string; keep: Character[] }
  | { kind: "timeout"; deadlineAt: string };

function setPending(s: FullState, p: PendingAction): FullState {
  return { ...s, pending: p };
}

export function reduce(state: FullState, action: Action): { state: FullState; events: LogEvent[] } {
  const events: LogEvent[] = [];
  let s = state;

  if (action.kind === "timeout") {
    const timedOut = { type: "timeout", payload: { player: s.currentPlayerId } };
    if (!s.pending) {
      const actor = getP(s, s.currentPlayerId!);
      if (actor.coins >= 10) {
        return reduce(s, {
          kind: "action",
          type: "coup",
          actorId: actor.id,
          targetId: nextAliveSeat(s, actor.id),
        });
      }
      return reduce(s, { kind: "action", type: "income", actorId: actor.id });
    }
    const pending = s.pending;
    if (pending.phase === "lose_influence" && pending.loseInfluence) {
      const player = getP(s, pending.loseInfluence.playerId);
      return reduce(s, { kind: "reveal", playerId: player.id, character: player.hand[0] });
    }
    if (pending.phase === "exchange_pick") {
      const player = getP(s, pending.actorId);
      return reduce(s, { kind: "exchange_return", playerId: player.id, keep: player.hand });
    }
    if (pending.phase === "challenge_action") {
      const meta = ACTION_META[pending.type];
      if (meta.blockable) {
        return {
          state: setPending(s, { ...pending, passed: [], phase: "block_window" }),
          events: [timedOut],
        };
      }
      return finishResolving(s, [timedOut]);
    }
    if (pending.phase === "block_window") return finishResolving(s, [timedOut]);
    if (pending.phase === "challenge_block") return advanceTurn(s, [timedOut]);
    return { state: s, events: [timedOut] };
  }

  if (action.kind === "action") {
    if (s.pending) throw new Error("Ação pendente em andamento");
    if (s.currentPlayerId !== action.actorId) throw new Error("Não é seu turno");
    const actor = getP(s, action.actorId);
    const meta = ACTION_META[action.type];
    if (actor.coins >= 10 && action.type !== "coup")
      throw new Error("Com 10+ moedas você é obrigado a dar Golpe");
    if (meta.cost && actor.coins < meta.cost) throw new Error("Moedas insuficientes");
    if (meta.targeted && !action.targetId) throw new Error("Alvo obrigatório");
    if (action.targetId && !getP(s, action.targetId).isAlive) throw new Error("Alvo inválido");
    if (action.targetId === action.actorId) throw new Error("Você não pode ser o próprio alvo");

    if (action.type === "coup" || action.type === "assassinate") {
      s = {
        ...s,
        players: s.players.map((p) =>
          p.id === actor.id ? { ...p, coins: p.coins - meta.cost! } : p,
        ),
      };
    }
    const pending: PendingAction = {
      type: action.type,
      actorId: action.actorId,
      targetId: action.targetId,
      phase: meta.challengeable
        ? "challenge_action"
        : meta.blockable
          ? "block_window"
          : "resolving",
      passed: [],
    };
    s = setPending(s, pending);
    events.push({
      type: "action_declared",
      payload: { actor: actor.id, action: action.type, target: action.targetId },
    });

    if (!meta.challengeable && !meta.blockable) return finishResolving(s, events);
    return { state: s, events };
  }

  const p0 = s.pending;
  if (!p0) throw new Error("Nenhuma ação pendente");

  if (action.kind === "pass") {
    if (!["challenge_action", "block_window", "challenge_block"].includes(p0.phase))
      throw new Error("Não há uma janela de resposta aberta");
    if (!getP(s, action.playerId).isAlive) throw new Error("Jogador eliminado não pode responder");
    const excluded = p0.phase === "challenge_block" ? p0.block!.blockerId : p0.actorId;
    if (action.playerId === excluded)
      throw new Error("O autor da alegação não responde à própria janela");
    if (p0.passed.includes(action.playerId)) return { state: s, events };
    const passed = [...p0.passed, action.playerId];
    const others = s.players.filter((p) => p.isAlive && p.id !== excluded).map((p) => p.id);
    const done = others.every((id) => passed.includes(id));
    s = setPending(s, { ...p0, passed });
    if (!done) return { state: s, events };

    if (p0.phase === "challenge_action") {
      const meta = ACTION_META[p0.type];
      if (meta.blockable) {
        s = setPending(s, { ...p0, passed: [], phase: "block_window" });
        return { state: s, events };
      }
      return finishResolving(s, events);
    }
    if (p0.phase === "block_window") return finishResolving(s, events);
    if (p0.phase === "challenge_block") {
      events.push({ type: "block_success", payload: { action: p0.type } });
      return advanceTurn(s, events);
    }
  }

  if (action.kind === "challenge") {
    if (p0.phase !== "challenge_action" && p0.phase !== "challenge_block")
      throw new Error("Fora da janela de desafio");
    const claimingChar =
      p0.phase === "challenge_block" ? p0.block!.character : ACTION_META[p0.type].character;
    if (!claimingChar) throw new Error("Nada a desafiar");
    const claimant = p0.phase === "challenge_block" ? p0.block!.blockerId : p0.actorId;
    if (action.challengerId === claimant) throw new Error("Você não pode desafiar a si mesmo");
    if (!getP(s, action.challengerId).isAlive)
      throw new Error("Jogador eliminado não pode desafiar");
    const claimantP = getP(s, claimant);
    events.push({
      type: "challenge_declared",
      payload: { challenger: action.challengerId, claimant, character: claimingChar },
    });

    if (claimantP.hand.includes(claimingChar)) {
      events.push({
        type: "challenge_failed",
        payload: { challenger: action.challengerId, character: claimingChar },
      });
      s = replaceCard(s, claimant, claimingChar);
      s = setPending(s, {
        ...p0,
        phase: "lose_influence",
        loseInfluence: { playerId: action.challengerId, reason: "desafio_perdido" },
      });
      return { state: s, events };
    } else {
      events.push({ type: "bluff_caught", payload: { claimant, character: claimingChar } });
      s = setPending(s, {
        ...p0,
        phase: "lose_influence",
        loseInfluence: { playerId: claimant, reason: "blefe_pego" },
      });
      return { state: s, events };
    }
  }

  if (action.kind === "block") {
    if (p0.phase !== "block_window") throw new Error("Fora da janela de bloqueio");
    if (!getP(s, action.blockerId).isAlive) throw new Error("Jogador eliminado não pode bloquear");
    if (action.blockerId === p0.actorId) throw new Error("Você não pode bloquear a própria ação");
    const t = p0.type;
    const ok =
      (t === "foreign_aid" && action.character === "duke") ||
      (t === "assassinate" && action.character === "contessa") ||
      (t === "steal" && (action.character === "captain" || action.character === "ambassador"));
    if (!ok) throw new Error("Personagem não pode bloquear essa ação");
    if ((t === "assassinate" || t === "steal") && action.blockerId !== p0.targetId)
      throw new Error("Só o alvo pode bloquear");
    events.push({
      type: "block_declared",
      payload: { blocker: action.blockerId, character: action.character },
    });
    s = setPending(s, {
      ...p0,
      phase: "challenge_block",
      passed: [],
      block: { blockerId: action.blockerId, character: action.character },
    });
    return { state: s, events };
  }

  if (action.kind === "reveal") {
    if (p0.phase !== "lose_influence" || !p0.loseInfluence) throw new Error("Nada a revelar");
    if (p0.loseInfluence.playerId !== action.playerId) throw new Error("Não é sua vez de revelar");
    const p = getP(s, action.playerId);
    if (!p.hand.includes(action.character)) throw new Error("Você não tem essa carta");
    const idx = p.hand.indexOf(action.character);
    const newHand = [...p.hand];
    newHand.splice(idx, 1);
    const newRevealed = [...p.revealed, action.character];
    const newAlive = newHand.length > 0;
    s = {
      ...s,
      players: s.players.map((pp) =>
        pp.id === action.playerId
          ? {
              ...pp,
              hand: newHand,
              revealed: newRevealed,
              isAlive: newAlive,
              coins: newAlive ? pp.coins : 0,
            }
          : pp,
      ),
    };
    events.push({
      type: "influence_lost",
      payload: { player: action.playerId, character: action.character },
    });
    const reason = p0.loseInfluence.reason;

    const won = checkWinner(s);
    if (won.status === "finished") {
      events.push({ type: "game_over", payload: { winner: won.winnerId } });
      return { state: won, events };
    }

    if (reason === "acao") {
      // veio de coup/assassinate — só avança
      return advanceTurn(s, events);
    }
    if (reason === "desafio_perdido") {
      if (p0.block) {
        events.push({ type: "block_success", payload: { action: p0.type } });
        return advanceTurn(s, events);
      }
      // O alvo eliminado pelo desafio já não pode bloquear. A ação continua,
      // mas não há outra influência/moedas para retirar dele.
      if (!newAlive && action.playerId === p0.targetId) {
        if (p0.type === "assassinate") return advanceTurn(s, events);
        s = setPending(s, { ...p0, phase: "resolving", loseInfluence: undefined });
        return finishResolving(s, events);
      }
      const meta = ACTION_META[p0.type];
      if (meta.blockable) {
        s = setPending(s, { ...p0, phase: "block_window", passed: [], loseInfluence: undefined });
        return { state: s, events };
      }
      s = setPending(s, { ...p0, phase: "resolving", loseInfluence: undefined });
      return finishResolving(s, events);
    }
    // blefe_pego
    if (p0.block && p0.block.blockerId === action.playerId) {
      s = setPending(s, { ...p0, phase: "resolving", loseInfluence: undefined, block: undefined });
      return finishResolving(s, events);
    }
    // Uma ação desafiada com sucesso falha por inteiro, inclusive seu custo.
    const cost = ACTION_META[p0.type].cost ?? 0;
    if (cost > 0 && getP(s, p0.actorId).isAlive) {
      s = {
        ...s,
        players: s.players.map((pp) =>
          pp.id === p0.actorId ? { ...pp, coins: pp.coins + cost } : pp,
        ),
      };
    }
    return advanceTurn(s, events);
  }

  if (action.kind === "exchange_return") {
    if (p0.phase !== "exchange_pick" || !p0.exchangeCards)
      throw new Error("Sem troca em andamento");
    const p = getP(s, p0.actorId);
    if (action.playerId !== p.id) throw new Error("Não é sua troca");
    const pool = [...p.hand, ...p0.exchangeCards];
    if (action.keep.length !== p.hand.length) throw new Error("Devolva o número certo");
    const poolCopy = [...pool];
    for (const c of action.keep) {
      const i = poolCopy.indexOf(c);
      if (i < 0) throw new Error("Carta inválida na escolha");
      poolCopy.splice(i, 1);
    }
    const deck = shuffle([...s.deck, ...poolCopy], s.rngSeed + s.deck.length + 1);
    s = {
      ...s,
      deck,
      players: s.players.map((pp) => (pp.id === p.id ? { ...pp, hand: action.keep } : pp)),
      pending: undefined,
    };
    events.push({ type: "exchange_done", payload: { player: p.id } });
    return advanceTurn(s, events);
  }

  return { state: s, events };
}

function finishResolving(
  s: FullState,
  events: LogEvent[],
): { state: FullState; events: LogEvent[] } {
  const p0 = s.pending!;
  const actor = getP(s, p0.actorId);
  switch (p0.type) {
    case "income":
      s = {
        ...s,
        players: s.players.map((p) => (p.id === actor.id ? { ...p, coins: p.coins + 1 } : p)),
      };
      events.push({ type: "income", payload: { player: actor.id } });
      return advanceTurn(s, events);
    case "foreign_aid":
      s = {
        ...s,
        players: s.players.map((p) => (p.id === actor.id ? { ...p, coins: p.coins + 2 } : p)),
      };
      events.push({ type: "foreign_aid", payload: { player: actor.id } });
      return advanceTurn(s, events);
    case "tax":
      s = {
        ...s,
        players: s.players.map((p) => (p.id === actor.id ? { ...p, coins: p.coins + 3 } : p)),
      };
      events.push({ type: "tax", payload: { player: actor.id } });
      return advanceTurn(s, events);
    case "steal": {
      const target = getP(s, p0.targetId!);
      const amt = Math.min(2, target.coins);
      s = {
        ...s,
        players: s.players.map((p) =>
          p.id === actor.id
            ? { ...p, coins: p.coins + amt }
            : p.id === target.id
              ? { ...p, coins: p.coins - amt }
              : p,
        ),
      };
      events.push({ type: "steal", payload: { from: target.id, to: actor.id, amount: amt } });
      return advanceTurn(s, events);
    }
    case "coup":
    case "assassinate":
      s = {
        ...s,
        pending: {
          ...p0,
          phase: "lose_influence",
          loseInfluence: { playerId: p0.targetId!, reason: "acao" },
        },
      };
      return { state: s, events };
    case "exchange": {
      const deck = [...s.deck];
      const drawn = [deck.pop()!, deck.pop()!];
      s = { ...s, deck, pending: { ...p0, phase: "exchange_pick", exchangeCards: drawn } };
      events.push({ type: "exchange_draw", payload: { player: actor.id } });
      return { state: s, events };
    }
  }
  return { state: s, events };
}

function advanceTurn(s: FullState, events: LogEvent[]): { state: FullState; events: LogEvent[] } {
  s = checkWinner(s);
  if (s.status === "finished") return { state: s, events };
  const from = s.pending?.actorId ?? s.currentPlayerId!;
  const next = nextAliveSeat(s, from);
  return { state: { ...s, pending: undefined, currentPlayerId: next }, events };
}
