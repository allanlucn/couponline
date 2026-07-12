import { useState } from "react";
import type { PlayerRow } from "@/hooks/useCoupRoom";
import type { ActionType, Character, PendingAction } from "@/game/types";
import { ACTION_META, CHARACTER_META } from "@/game/types";
import { InfluenceCard } from "./InfluenceCard";

type Props = {
  players: PlayerRow[];
  myPlayerId: string | null;
  currentPlayerId: string | null;
  pending: PendingAction | null | undefined;
  myCoins: number;
  myHand: Character[];
  onAction: (act: unknown) => Promise<void>;
};

const ACTIONS: { type: ActionType; label: string; hint: string; danger?: boolean }[] = [
  { type: "income", label: "Renda", hint: "+1 moeda" },
  { type: "foreign_aid", label: "Ajuda Externa", hint: "+2, bloqueável por Duque" },
  { type: "coup", label: "Golpe", hint: "Paga 7. Alvo perde 1 influência.", danger: true },
  { type: "tax", label: "Taxar", hint: "Duque · +3" },
  { type: "assassinate", label: "Assassinar", hint: "Assassino · paga 3", danger: true },
  { type: "steal", label: "Extorquir", hint: "Capitão · +2 do alvo" },
  { type: "exchange", label: "Trocar", hint: "Embaixador · sacar 2" },
];

const panelClass =
  "border-[3px] border-[var(--pop-ink,#101114)] bg-[var(--pop-panel,#fff5dc)] text-[var(--pop-ink,#101114)] shadow-[6px_6px_0_var(--pop-ink,#101114)]";
const buttonBase =
  "min-h-14 border-[3px] border-[var(--pop-ink,#101114)] px-4 py-3 text-left text-base font-bold leading-tight text-[var(--pop-ink,#101114)] shadow-[3px_3px_0_var(--pop-ink,#101114)] transition-transform hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_var(--pop-ink,#101114)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--pop-focus,#3478f6)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:translate-y-0";

export function ActionDock({
  players,
  myPlayerId,
  currentPlayerId,
  pending,
  myCoins,
  myHand,
  onAction,
}: Props) {
  const [picking, setPicking] = useState<ActionType | null>(null);
  const me = players.find((p) => p.id === myPlayerId);
  if (!me) return null;
  const isMyTurn = currentPlayerId === myPlayerId && !pending;
  const mustCoup = myCoins >= 10;

  async function doAction(type: ActionType, targetId?: string) {
    setPicking(null);
    await onAction({ kind: "action", type, actorId: myPlayerId, targetId });
  }

  if (pending && me.is_alive) {
    return (
      <PendingUI pending={pending} me={me} players={players} myHand={myHand} onAction={onAction} />
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4">
      <section
        aria-label="Ações do turno"
        className={`pointer-events-auto mx-auto max-w-7xl p-3 sm:p-4 ${panelClass}`}
      >
        <PlayerHand cards={myHand} />
        {!isMyTurn ? (
          <div className="py-2 text-center text-sm font-bold" role="status" aria-live="polite">
            {currentPlayerId
              ? `Aguardando ${players.find((p) => p.id === currentPlayerId)?.name ?? "…"}`
              : "Aguardando…"}
          </div>
        ) : picking ? (
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <strong className="font-display text-base uppercase">Escolha o alvo</strong>
              <span className="rounded-full border-2 border-current px-2 py-0.5 text-xs">
                {ACTION_META[picking].name}
              </span>
            </div>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto p-1">
              {players
                .filter((p) => p.id !== myPlayerId && p.is_alive)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => doAction(picking, p.id)}
                    className={`${buttonBase} bg-[var(--pop-danger,#d7193f)] text-white`}
                  >
                    {p.name}
                  </button>
                ))}
              <button
                onClick={() => setPicking(null)}
                className={`${buttonBase} bg-[var(--pop-white,#fffdf7)]`}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {ACTIONS.map((a) => {
              const meta = ACTION_META[a.type];
              const disabled =
                (mustCoup && a.type !== "coup") || (meta.cost && myCoins < meta.cost) || false;
              return (
                <button
                  key={a.type}
                  disabled={!!disabled}
                  onClick={() => (meta.targeted ? setPicking(a.type) : doAction(a.type))}
                  className={`${buttonBase} ${a.danger ? "bg-[var(--pop-danger,#d7193f)] text-white" : "bg-[var(--pop-warning,#f4b900)]"}`}
                  title={a.hint}
                  aria-label={`${a.label}: ${a.hint}`}
                >
                  <span className="block font-display text-base uppercase sm:text-lg">
                    {a.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-medium opacity-80 sm:text-xs">
                    {a.hint}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {isMyTurn && mustCoup && !picking && (
          <p className="mt-2 text-center text-xs font-bold" role="status">
            Com 10 moedas, o Golpe é obrigatório.
          </p>
        )}
      </section>
    </div>
  );
}

function PlayerHand({
  cards,
  onSelect,
}: {
  cards: Character[];
  onSelect?: (character: Character) => void;
}) {
  if (cards.length === 0) return null;
  return (
    <div className="mb-3 border-b-[3px] border-[var(--pop-ink)] pb-3">
      <div className="mb-1 text-center font-display text-sm font-black uppercase sm:text-base">
        Sua mão
      </div>
      <div className="flex items-end justify-center gap-3 sm:gap-5" aria-label="Suas influências">
        {cards.map((character, index) => {
          const card = <InfluenceCard character={character} size="md" />;
          return onSelect ? (
            <button
              key={`${character}-${index}`}
              type="button"
              onClick={() => onSelect(character)}
              className="rounded-md transition-transform hover:-translate-y-2 focus-visible:-translate-y-2 motion-reduce:transition-none"
              aria-label={`Revelar ${CHARACTER_META[character].name}`}
            >
              {card}
            </button>
          ) : (
            <div key={`${character}-${index}`} className="-mb-1 first:-rotate-2 last:rotate-2">
              {card}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PendingUI({
  pending,
  me,
  players,
  myHand,
  onAction,
}: {
  pending: PendingAction;
  me: PlayerRow;
  players: PlayerRow[];
  myHand: Character[];
  onAction: (a: unknown) => Promise<void>;
}) {
  const actor = players.find((p) => p.id === pending.actorId);
  const meta = ACTION_META[pending.type];
  const target = pending.targetId ? players.find((p) => p.id === pending.targetId) : null;

  if (pending.phase === "lose_influence" && pending.loseInfluence?.playerId === me.id) {
    return (
      <div className="fixed inset-0 z-40 grid place-items-center bg-[var(--pop-ink)]/25 px-4 pb-24 sm:pb-28">
        <section
          aria-labelledby="lose-influence-title"
          className={`anim-fade-up w-full max-w-2xl border-[5px] p-6 text-center shadow-[10px_10px_0_var(--pop-ink)] sm:p-8 ${panelClass}`}
        >
          <h2 id="lose-influence-title" className="font-display text-2xl uppercase sm:text-4xl">
            Você deve perder uma influência!
          </h2>
          <p className="mt-1 text-sm font-medium">Escolha qual carta revelar. Ela sairá do jogo.</p>
          <div
            id="reveal-picker"
            className="mt-2 border-2 border-dashed border-current bg-[var(--pop-danger,#d7193f)] p-2 text-xs font-bold text-white"
          >
            Toque numa carta da sua mão abaixo para revelá-la.
          </div>
          <div
            className={`fixed inset-x-2 bottom-2 z-50 mx-auto max-w-4xl p-3 sm:p-4 ${panelClass}`}
          >
            <PlayerHand
              cards={myHand}
              onSelect={(character) => onAction({ kind: "reveal", playerId: me.id, character })}
            />
          </div>
        </section>
      </div>
    );
  }

  const isChallengePhase =
    pending.phase === "challenge_action" || pending.phase === "challenge_block";
  const isBlockPhase = pending.phase === "block_window";
  const excluded = pending.phase === "challenge_block" ? pending.block!.blockerId : pending.actorId;
  const canReact = me.id !== excluded && me.is_alive && !pending.passed.includes(me.id);
  const claimingChar =
    pending.phase === "challenge_block" ? pending.block!.character : meta.character;

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-[var(--pop-ink)]/20 px-4 pb-24 sm:pb-28">
      <section
        aria-label="Reação pendente"
        className={`anim-fade-up w-full max-w-3xl border-[5px] p-6 shadow-[10px_10px_0_var(--pop-ink)] sm:p-8 ${panelClass}`}
      >
        <div className={`fixed inset-x-2 bottom-2 z-50 mx-auto max-w-4xl p-3 sm:p-4 ${panelClass}`}>
          <PlayerHand cards={myHand} />
        </div>
        <p className="mb-3 text-sm font-medium" aria-live="polite">
          <span className="font-display text-xl uppercase sm:text-3xl">
            {actor?.name} declara <b>{meta.name}</b>
            {target && (
              <>
                {" "}
                em <b>{target.name}</b>
              </>
            )}
            {claimingChar && (
              <>
                {" "}
                · alega <b>{CHARACTER_META[claimingChar].name}</b>
              </>
            )}
          </span>
        </p>
        {canReact && isChallengePhase && (
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => onAction({ kind: "challenge", challengerId: me.id })}
              className={`${buttonBase} bg-[var(--pop-danger,#d7193f)] text-white`}
            >
              Desafiar {claimingChar ? `(${CHARACTER_META[claimingChar].name})` : ""}
            </button>
            <button
              onClick={() => onAction({ kind: "pass", playerId: me.id })}
              className={`${buttonBase} bg-[var(--pop-white,#fffdf7)]`}
            >
              Passar
            </button>
          </div>
        )}
        {canReact && isBlockPhase && (
          <div className="flex flex-wrap justify-center gap-4">
            <BlockButtons pending={pending} me={me} myHand={myHand} onAction={onAction} />
            <button
              onClick={() => onAction({ kind: "pass", playerId: me.id })}
              className={`${buttonBase} bg-[var(--pop-white,#fffdf7)]`}
            >
              Passar
            </button>
          </div>
        )}
        {!canReact && (
          <div className="text-center text-base font-bold" role="status">
            {pending.passed.includes(me.id)
              ? "Você já passou. Aguardando os demais…"
              : "Aguardando reação dos outros…"}
          </div>
        )}
      </section>
    </div>
  );
}

function BlockButtons({
  pending,
  me,
  myHand,
  onAction,
}: {
  pending: PendingAction;
  me: PlayerRow;
  myHand: Character[];
  onAction: (a: unknown) => Promise<void>;
}) {
  const [choosingCharacter, setChoosingCharacter] = useState(false);
  const options: Character[] = [];
  if (pending.type === "foreign_aid") options.push("duke");
  else if (pending.type === "assassinate" && me.id === pending.targetId) options.push("contessa");
  else if (pending.type === "steal" && me.id === pending.targetId)
    options.push("captain", "ambassador");
  if (options.length === 0) return null;

  if (!choosingCharacter) {
    return (
      <button
        onClick={() => setChoosingCharacter(true)}
        className={`${buttonBase} bg-[var(--pop-info,#087985)] text-white`}
      >
        Bloquear como...
      </button>
    );
  }

  const sortedOptions = [...options].sort(
    (a, b) => Number(myHand.includes(b)) - Number(myHand.includes(a)),
  );

  return (
    <div className="w-full">
      <div className="mb-3 text-center font-display text-lg font-black uppercase">
        Escolha quem vocÃª vai alegar
      </div>
      <div className="flex flex-wrap items-stretch justify-center gap-4">
        {sortedOptions.map((c) => {
          const isInHand = myHand.includes(c);
          return (
            <button
              key={c}
              onClick={() => onAction({ kind: "block", blockerId: me.id, character: c })}
              className={`relative flex min-w-36 flex-col items-center gap-2 border-[4px] border-[var(--pop-ink)] p-3 font-black shadow-[5px_5px_0_var(--pop-ink)] transition-transform hover:-translate-y-1 ${
                isInHand
                  ? "-translate-y-2 bg-[var(--pop-warning)] text-[var(--pop-ink)] ring-4 ring-[var(--pop-danger)] ring-offset-2"
                  : "bg-[var(--pop-white)] text-[var(--pop-ink)]"
              }`}
            >
              {isInHand && (
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap border-2 border-[var(--pop-ink)] bg-[var(--pop-danger)] px-2 py-1 text-xs uppercase text-white">
                  Na sua mÃ£o
                </span>
              )}
              <InfluenceCard character={c} size="md" />
              <span className="font-display text-lg uppercase">{CHARACTER_META[c].name}</span>
              <span className="text-xs uppercase opacity-70">
                {isInHand ? "Bloqueio real" : "Blefe"}
              </span>
            </button>
          );
        })}
      </div>
      <button
        onClick={() => setChoosingCharacter(false)}
        className={`${buttonBase} mx-auto mt-4 bg-[var(--pop-white)]`}
      >
        Voltar
      </button>
    </div>
  );
}
