export type Character = "duke" | "assassin" | "captain" | "ambassador" | "contessa";

export const CHARACTERS: Character[] = ["duke", "assassin", "captain", "ambassador", "contessa"];

export const CHARACTER_META: Record<
  Character,
  { name: string; action?: string; blocks?: string; hue: number }
> = {
  duke: { name: "Duque", action: "Taxar (+3)", blocks: "Ajuda Externa", hue: 45 },
  assassin: { name: "Assassino", action: "Assassinar (−3)", hue: 0 },
  captain: { name: "Capitão", action: "Extorquir (+2)", blocks: "Extorsão", hue: 210 },
  ambassador: { name: "Embaixador", action: "Trocar", blocks: "Extorsão", hue: 150 },
  contessa: { name: "Condessa", blocks: "Assassinato", hue: 320 },
};

export type ActionType =
  | "income"
  | "foreign_aid"
  | "coup"
  | "tax"
  | "assassinate"
  | "steal"
  | "exchange";

export const ACTION_META: Record<
  ActionType,
  { name: string; character?: Character; cost?: number; targeted: boolean; challengeable: boolean; blockable: boolean }
> = {
  income: { name: "Renda", targeted: false, challengeable: false, blockable: false },
  foreign_aid: { name: "Ajuda Externa", targeted: false, challengeable: false, blockable: true },
  coup: { name: "Golpe", cost: 7, targeted: true, challengeable: false, blockable: false },
  tax: { name: "Taxar", character: "duke", targeted: false, challengeable: true, blockable: false },
  assassinate: { name: "Assassinar", character: "assassin", cost: 3, targeted: true, challengeable: true, blockable: true },
  steal: { name: "Extorquir", character: "captain", targeted: true, challengeable: true, blockable: true },
  exchange: { name: "Trocar", character: "ambassador", targeted: false, challengeable: true, blockable: false },
};

export type CardSlot = { character: Character; revealed: boolean };

export type PlayerState = {
  id: string;
  name: string;
  seat: number;
  coins: number;
  isAlive: boolean;
  revealed: Character[]; // revealed characters (public)
  handSize: number; // number of unrevealed cards (public info)
};

export type PendingAction = {
  type: ActionType;
  actorId: string;
  targetId?: string;
  // resolution phase: waiting on challenges/blocks
  phase: "challenge_action" | "block_window" | "challenge_block" | "resolving" | "exchange_pick" | "lose_influence";
  // who has passed on the current challenge/block window
  passed: string[];
  // block declared
  block?: { blockerId: string; character: Character };
  // who needs to lose an influence
  loseInfluence?: { playerId: string; reason: string };
  // exchange draw
  exchangeCards?: Character[];
};

export type PublicGameState = {
  status: "lobby" | "playing" | "finished";
  turn: number;
  currentPlayerId?: string;
  pending?: PendingAction;
  deckCount: number;
  log: number; // last event seq
};
