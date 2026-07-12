import { useState } from "react";
import type { PlayerRow } from "@/hooks/useCoupRoom";
import type { ActionType, Character, PendingAction } from "@/game/types";
import { ACTION_META, CHARACTER_META } from "@/game/types";

type Props = {
  players: PlayerRow[];
  myPlayerId: string | null;
  currentPlayerId: string | null;
  pending: PendingAction | null | undefined;
  myCoins: number;
  onAction: (act: any) => Promise<void>;
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

export function ActionDock({ players, myPlayerId, currentPlayerId, pending, myCoins, onAction }: Props) {
  const [picking, setPicking] = useState<ActionType | null>(null);
  const me = players.find((p) => p.id === myPlayerId);
  if (!me) return null;
  const isMyTurn = currentPlayerId === myPlayerId && !pending;
  const mustCoup = myCoins >= 10;

  async function doAction(type: ActionType, targetId?: string) {
    setPicking(null);
    await onAction({ kind: "action", type, actorId: myPlayerId, targetId });
  }

  // pending-driven UI
  if (pending && me.is_alive) {
    return <PendingUI pending={pending} me={me} players={players} onAction={onAction} />;
  }

  return (
    <div className="fixed left-0 right-0 bottom-0 z-20 pointer-events-none">
      <div className="mx-auto max-w-4xl p-3 pointer-events-auto">
        <div className="bg-[oklch(0.18_0.02_265)]/90 backdrop-blur rounded-t-xl border border-white/10 border-b-0 p-3">
          {!isMyTurn ? (
            <div className="text-center text-sm text-muted-foreground py-2">
              {currentPlayerId
                ? `Aguardando ${players.find((p) => p.id === currentPlayerId)?.name ?? "…"}`
                : "Aguardando…"}
            </div>
          ) : picking ? (
            <div>
              <div className="text-sm mb-2">Escolha o alvo:</div>
              <div className="flex flex-wrap gap-2">
                {players
                  .filter((p) => p.id !== myPlayerId && p.is_alive)
                  .map((p) => (
                    <button key={p.id} onClick={() => doAction(picking, p.id)} className="btn-danger rounded-md px-3 py-2 text-sm">
                      {p.name}
                    </button>
                  ))}
                <button onClick={() => setPicking(null)} className="btn-ghost rounded-md px-3 py-2 text-sm">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ACTIONS.map((a) => {
                const meta = ACTION_META[a.type];
                const disabled =
                  (mustCoup && a.type !== "coup") ||
                  (meta.cost && myCoins < meta.cost) ||
                  false;
                return (
                  <button
                    key={a.type}
                    disabled={!!disabled}
                    onClick={() => {
                      if (meta.targeted) setPicking(a.type);
                      else doAction(a.type);
                    }}
                    className={`${a.danger ? "btn-danger" : "btn-primary"} rounded-md px-3 py-2 text-sm text-left`}
                    title={a.hint}
                  >
                    <div className="font-semibold">{a.label}</div>
                    <div className="text-[10px] opacity-80 truncate">{a.hint}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PendingUI({
  pending,
  me,
  players,
  onAction,
}: {
  pending: PendingAction;
  me: PlayerRow;
  players: PlayerRow[];
  onAction: (a: any) => Promise<void>;
}) {
  const [revealing, setRevealing] = useState<Character | null>(null);
  const actor = players.find((p) => p.id === pending.actorId);
  const meta = ACTION_META[pending.type];
  const target = pending.targetId ? players.find((p) => p.id === pending.targetId) : null;

  // Loss of influence — my turn to reveal
  if (pending.phase === "lose_influence" && pending.loseInfluence?.playerId === me.id) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-20 p-3">
        <div className="mx-auto max-w-2xl bg-[var(--bordeaux)]/95 backdrop-blur rounded-t-xl border border-white/10 p-4 text-center">
          <div className="font-display text-lg mb-2">Você deve perder uma influência.</div>
          <p className="text-sm mb-3 opacity-90">Escolha qual carta revelar (ela sai do jogo).</p>
          <div id="reveal-picker" className="text-xs opacity-70">
            Toque numa carta da sua mão abaixo para revelá-la.
          </div>
          <RevealButtons me={me} onReveal={(c) => onAction({ kind: "reveal", playerId: me.id, character: c })} />
        </div>
      </div>
    );
  }

  const isChallengePhase = pending.phase === "challenge_action" || pending.phase === "challenge_block";
  const isBlockPhase = pending.phase === "block_window";

  const excluded =
    pending.phase === "challenge_block" ? pending.block!.blockerId : pending.actorId;
  const canReact = me.id !== excluded && me.is_alive && !pending.passed.includes(me.id);
  const claimingChar =
    pending.phase === "challenge_block" ? pending.block!.character : meta.character;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 p-3">
      <div className="mx-auto max-w-3xl bg-[oklch(0.18_0.02_265)]/95 backdrop-blur rounded-t-xl border border-white/10 p-3 anim-fade-up">
        <div className="text-sm mb-3">
          <span className="font-display text-base">
            {actor?.name} declara <b>{meta.name}</b>
            {target && (
              <>
                {" "}em <b>{target.name}</b>
              </>
            )}
            {claimingChar && (
              <>
                {" · "}alega <b>{CHARACTER_META[claimingChar].name}</b>
              </>
            )}
          </span>
        </div>

        {canReact && isChallengePhase && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onAction({ kind: "challenge", challengerId: me.id })}
              className="btn-danger rounded-md px-3 py-2 text-sm"
            >
              Desafiar {claimingChar ? `(${CHARACTER_META[claimingChar].name})` : ""}
            </button>
            <button
              onClick={() => onAction({ kind: "pass", playerId: me.id })}
              className="btn-ghost rounded-md px-3 py-2 text-sm"
            >
              Passar
            </button>
          </div>
        )}

        {canReact && isBlockPhase && (
          <div className="flex flex-wrap gap-2">
            <BlockButtons pending={pending} me={me} onAction={onAction} />
            <button
              onClick={() => onAction({ kind: "pass", playerId: me.id })}
              className="btn-ghost rounded-md px-3 py-2 text-sm"
            >
              Passar
            </button>
          </div>
        )}

        {!canReact && (
          <div className="text-xs text-muted-foreground">
            {pending.passed.includes(me.id) ? "Você já passou. Aguardando os demais…" : "Aguardando reação dos outros…"}
          </div>
        )}
      </div>
    </div>
  );
}

function BlockButtons({
  pending,
  me,
  onAction,
}: {
  pending: PendingAction;
  me: PlayerRow;
  onAction: (a: any) => Promise<void>;
}) {
  const t = pending.type;
  const options: Character[] = [];
  if (t === "foreign_aid") options.push("duke");
  else if (t === "assassinate" && me.id === pending.targetId) options.push("contessa");
  else if (t === "steal" && me.id === pending.targetId) options.push("captain", "ambassador");
  if (options.length === 0) return null;
  return (
    <>
      {options.map((c) => (
        <button
          key={c}
          onClick={() => onAction({ kind: "block", blockerId: me.id, character: c })}
          className="btn-primary rounded-md px-3 py-2 text-sm"
        >
          Bloquear como {CHARACTER_META[c].name}
        </button>
      ))}
    </>
  );
}

function RevealButtons({ me, onReveal }: { me: PlayerRow; onReveal: (c: Character) => void }) {
  // We don't have the hand here directly — but Reveal buttons will send the character.
  // We ask the parent to render the hand and pass hand cards as buttons.
  return null;
}
