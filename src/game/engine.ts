// Pure Coup rules engine. Given a snapshot of full game state (with hidden hands),
// applies an action/event and returns the next snapshot plus a list of log events.
// The engine never talks to the DB — the server function assembles state, calls
// the engine, and persists the result.

import { CHARACTERS, ACTION_META, type ActionType, type Character } from "./types";

export type FullPlayer = {
  id: string;
  name: string;
  seat: number;
  coins: number;
  isAlive: boolean;
  hand: Character[]; // unrevealed cards
  revealed: Character[]; // revealed/lost cards
};

export type FullState = {
  status: "lobby" | "playing" | "finished";
  players: FullPlayer[]; // sorted by seat
  deck: Character[];
  currentPlayerId?: string;
  pending?: import("./types").PendingAction;
  winnerId?: string;
  rngSeed: number;
};

export type LogEvent = { type: string; payload: Record<string, unknown> };

// -------- deck helpers ------------
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
  const deck: Character[] = [];
  for (const c of CHARACTERS) for (let i = 0; i < 3; i++) deck.push(c);
  return deck;
}

export function startGame(players: Omit<FullPlayer, "hand" | "revealed" | "coins" | "isAlive">[], seed: number): FullState {
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
  };
}

// -------- lookups ------------
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
    return { ...s, status: "finished", winnerId: alive[0].id, currentPlayerId: undefined, pending: undefined };
  }
  return s;
}

// return card to deck and draw new one
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

// -------- actions ------------
export type Action =
  | { kind: "action"; type: ActionType; actorId: string; targetId?: string }
  | { kind: "challenge"; challengerId: string }
  | { kind: "block"; blockerId: string; character: Character }
  | { kind: "pass"; playerId: string }
  | { kind: "reveal"; playerId: string; character: Character } // choose which card to lose
  | { kind: "exchange_return"; playerId: string; keep: Character[] };

export function reduce(state: FullState, action: Action): { state: FullState; events: LogEvent[] } {
  const events: LogEvent[] = [];
  let s = state;

  if (action.kind === "action") {
    if (s.pending) throw new Error("Ação pendente em andamento");
    if (s.currentPlayerId !== action.actorId) throw new Error("Não é seu turno");
    const actor = getP(s, action.actorId);
    const meta = ACTION_META[action.type];
    // 10+ moedas obriga Golpe
    if (actor.coins >= 10 && action.type !== "coup") throw new Error("Com 10+ moedas você é obrigado a dar Golpe");
    if (meta.cost && actor.coins < meta.cost) throw new Error("Moedas insuficientes");
    if (meta.targeted && !action.targetId) throw new Error("Alvo obrigatório");
    if (action.targetId && !getP(s, action.targetId).isAlive) throw new Error("Alvo inválido");

    // Cobra custo antecipadamente para golpe/assassinato (regra oficial)
    if (action.type === "coup" || action.type === "assassinate") {
      s = { ...s, players: s.players.map((p) => (p.id === actor.id ? { ...p, coins: p.coins - meta.cost! } : p)) };
    }
    const pending: import("./types").PendingAction = {
      type: action.type,
      actorId: action.actorId,
      targetId: action.targetId,
      phase: meta.challengeable ? "challenge_action" : meta.blockable ? "block_window" : "resolving",
      passed: [],
    };
    s = { ...s, pending };
    events.push({ type: "action_declared", payload: { actor: actor.id, action: action.type, target: action.targetId } });

    // Imediata para ações não desafiáveis nem bloqueáveis
    if (!meta.challengeable && !meta.blockable) {
      return finishResolving(s, events);
    }
    return { state: s, events };
  }

  if (!s.pending) throw new Error("Nenhuma ação pendente");

  if (action.kind === "pass") {
    const pending = s.pending;
    if (pending.passed.includes(action.playerId)) return { state: s, events };
    const passed = [...pending.passed, action.playerId];
    // quem precisa passar? Todos vivos exceto o autor (na janela da ação) ou exceto o bloqueador (na janela do bloqueio)
    const others = s.players.filter((p) => p.isAlive && p.id !== (pending.phase === "challenge_block" ? pending.block!.blockerId : pending.actorId)).map((p) => p.id);
    // No block_window, o alvo (se houver) é quem tem prioridade de bloqueio, mas qualquer um pode desafiar durante challenge_action.
    // Para challenge_action e challenge_block, exigimos que todos os "outros" tenham passado antes de avançar.
    // Para block_window (bloqueio de ajuda externa), qualquer jogador pode bloquear; se todos passarem, ação resolve.
    const done = others.every((id) => passed.includes(id));
    s = { ...s, pending: { ...pending, passed } };
    if (!done) return { state: s, events };

    // avança de fase
    if (pending.phase === "challenge_action") {
      const meta = ACTION_META[pending.type];
      if (meta.blockable) {
        s = { ...s, pending: { ...s.pending!, phase: "block_window", passed: [] } };
        return { state: s, events };
      }
      return finishResolving(s, events);
    }
    if (pending.phase === "block_window") {
      // ninguém bloqueou → ação passa
      return finishResolving(s, events);
    }
    if (pending.phase === "challenge_block") {
      // ninguém contestou o bloqueio → bloqueio efetivo, ação falha
      events.push({ type: "block_success", payload: { action: pending.type } });
      return advanceTurn(s, events);
    }
  }

  if (action.kind === "challenge") {
    const pending = s.pending;
    const claimingChar =
      pending.phase === "challenge_block"
        ? pending.block!.character
        : ACTION_META[pending.type].character;
    if (!claimingChar) throw new Error("Nada a desafiar");
    const claimant = pending.phase === "challenge_block" ? pending.block!.blockerId : pending.actorId;
    const claimantP = getP(s, claimant);
    events.push({ type: "challenge_declared", payload: { challenger: action.challengerId, claimant, character: claimingChar } });

    if (claimantP.hand.includes(claimingChar)) {
      // desafiante perde influência; reposição
      events.push({ type: "challenge_failed", payload: { challenger: action.challengerId, character: claimingChar } });
      s = replaceCard(s, claimant, claimingChar);
      // desafiante deve perder 1 influência
      s = { ...s, pending: { ...pending, phase: "lose_influence", loseInfluence: { playerId: action.challengerId, reason: "desafio_perdido" } } };
      return { state: s, events };
    } else {
      // claimant blefou: perde influência, ação/bloqueio falha
      events.push({ type: "bluff_caught", payload: { claimant, character: claimingChar } });
      s = { ...s, pending: { ...pending, phase: "lose_influence", loseInfluence: { playerId: claimant, reason: "blefe_pego" } } };
      return { state: s, events };
    }
  }

  if (action.kind === "block") {
    const pending = s.pending;
    if (pending.phase !== "block_window") throw new Error("Fora da janela de bloqueio");
    // valida se o personagem alegado pode bloquear a ação
    const t = pending.type;
    const ok =
      (t === "foreign_aid" && action.character === "duke") ||
      (t === "assassinate" && action.character === "contessa") ||
      (t === "steal" && (action.character === "captain" || action.character === "ambassador"));
    if (!ok) throw new Error("Personagem não pode bloquear essa ação");
    // Para assassinato, só o alvo pode bloquear
    if (t === "assassinate" && action.blockerId !== pending.targetId) throw new Error("Só o alvo pode bloquear");
    if (t === "steal" && action.blockerId !== pending.targetId) throw new Error("Só o alvo pode bloquear");
    events.push({ type: "block_declared", payload: { blocker: action.blockerId, character: action.character } });
    s = {
      ...s,
      pending: { ...pending, phase: "challenge_block", passed: [], block: { blockerId: action.blockerId, character: action.character } },
    };
    return { state: s, events };
  }

  if (action.kind === "reveal") {
    const pending = s.pending;
    if (pending.phase !== "lose_influence" || !pending.loseInfluence) throw new Error("Nada a revelar");
    if (pending.loseInfluence.playerId !== action.playerId) throw new Error("Não é sua vez de revelar");
    const p = getP(s, action.playerId);
    if (!p.hand.includes(action.character)) throw new Error("Você não tem essa carta");
    // remove uma cópia da mão, adiciona a revelados
    const idx = p.hand.indexOf(action.character);
    const newHand = [...p.hand];
    newHand.splice(idx, 1);
    const newRevealed = [...p.revealed, action.character];
    const newAlive = newHand.length > 0;
    s = {
      ...s,
      players: s.players.map((pp) =>
        pp.id === action.playerId ? { ...pp, hand: newHand, revealed: newRevealed, isAlive: newAlive } : pp,
      ),
    };
    events.push({ type: "influence_lost", payload: { player: action.playerId, character: action.character } });
    const reason = pending.loseInfluence.reason;
    // após perda, decidir se ação principal segue ou falha
    let next = { ...s, pending: { ...pending, loseInfluence: undefined, phase: "resolving" as const } };
    // vitória?
    const won = checkWinner(next);
    if (won.status === "finished") {
      events.push({ type: "game_over", payload: { winner: won.winnerId } });
      return { state: won, events };
    }
    if (reason === "desafio_perdido") {
      // ação/bloqueio original prossegue
      if (pending.phase === "challenge_block" || pending.block) {
        // bloqueio prevaleceu → ação falha
        events.push({ type: "block_success", payload: { action: pending.type } });
        return advanceTurn(next, events);
      }
      // desafio na ação: ação continua; se tinha janela de bloqueio, abrir
      const meta = ACTION_META[pending.type];
      if (meta.blockable) {
        next = { ...next, pending: { ...pending, phase: "block_window", passed: [], loseInfluence: undefined } };
        return { state: next, events };
      }
      return finishResolving(next, events);
    } else {
      // blefe_pego
      if (pending.block && pending.block.blockerId === action.playerId) {
        // bloqueador blefou → bloqueio cai, ação segue
        return finishResolving({ ...next, pending: { ...pending, block: undefined, loseInfluence: undefined, phase: "resolving" } }, events);
      }
      // autor blefou na ação → ação falha, avança turno
      return advanceTurn(next, events);
    }
  }

  if (action.kind === "exchange_return") {
    const pending = s.pending;
    if (pending.phase !== "exchange_pick" || !pending.exchangeCards) throw new Error("Sem troca em andamento");
    const p = getP(s, pending.actorId);
    if (action.playerId !== p.id) throw new Error("Não é sua troca");
    const pool = [...p.hand, ...pending.exchangeCards];
    if (action.keep.length !== p.hand.length) throw new Error("Devolva o número certo");
    // valida que keep é subconjunto de pool
    const poolCopy = [...pool];
    for (const c of action.keep) {
      const i = poolCopy.indexOf(c);
      if (i < 0) throw new Error("Carta inválida na escolha");
      poolCopy.splice(i, 1);
    }
    // devolve poolCopy ao baralho, embaralha
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

function finishResolving(s: FullState, events: LogEvent[]): { state: FullState; events: LogEvent[] } {
  const pending = s.pending!;
  const actor = getP(s, pending.actorId);
  switch (pending.type) {
    case "income": {
      s = { ...s, players: s.players.map((p) => (p.id === actor.id ? { ...p, coins: p.coins + 1 } : p)) };
      events.push({ type: "income", payload: { player: actor.id } });
      return advanceTurn(s, events);
    }
    case "foreign_aid": {
      s = { ...s, players: s.players.map((p) => (p.id === actor.id ? { ...p, coins: p.coins + 2 } : p)) };
      events.push({ type: "foreign_aid", payload: { player: actor.id } });
      return advanceTurn(s, events);
    }
    case "tax": {
      s = { ...s, players: s.players.map((p) => (p.id === actor.id ? { ...p, coins: p.coins + 3 } : p)) };
      events.push({ type: "tax", payload: { player: actor.id } });
      return advanceTurn(s, events);
    }
    case "steal": {
      const target = getP(s, pending.targetId!);
      const amt = Math.min(2, target.coins);
      s = {
        ...s,
        players: s.players.map((p) =>
          p.id === actor.id ? { ...p, coins: p.coins + amt } : p.id === target.id ? { ...p, coins: p.coins - amt } : p,
        ),
      };
      events.push({ type: "steal", payload: { from: target.id, to: actor.id, amount: amt } });
      return advanceTurn(s, events);
    }
    case "coup":
    case "assassinate": {
      // alvo escolhe carta para perder
      s = { ...s, pending: { ...pending, phase: "lose_influence", loseInfluence: { playerId: pending.targetId!, reason: "acao" } } };
      // se o alvo tem só 1 carta, ele ainda escolhe (mas trivial). Deixamos escolha explícita.
      return { state: s, events };
    }
    case "exchange": {
      const drawn: Character[] = [];
      const deck = [...s.deck];
      drawn.push(deck.pop()!, deck.pop()!);
      s = { ...s, deck, pending: { ...pending, phase: "exchange_pick", exchangeCards: drawn } };
      events.push({ type: "exchange_draw", payload: { player: actor.id } });
      return { state: s, events };
    }
  }
  return { state: s, events };
}

function advanceTurn(s: FullState, events: LogEvent[]): { state: FullState; events: LogEvent[] } {
  s = checkWinner(s);
  if (s.status === "finished") return { state: s, events };
  const next = nextAliveSeat(s, s.pending?.actorId ?? s.currentPlayerId!);
  return { state: { ...s, pending: undefined, currentPlayerId: next }, events };
}

// Special handler for lose_influence when it's an "action" reason (from coup/assassinate)
// We treat "acao" reveal specially: after reveal, if it was assassinate blocked by contessa this wouldn't run.
// We handle it in the reveal handler above via the "reason" pathway. For "acao" reason coup/assassinate,
// after reveal we simply advance turn — handled here:
// (Extending reduce to catch reason === "acao" needs a tweak — we handle by inserting logic:)

// Extend reduce for "acao" reason -- monkey-patched below by intercepting reveal path.
// Simpler: overload advanceTurn behavior by checking reason after reveal.
