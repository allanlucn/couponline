import type { PlayerRow } from "@/hooks/useCoupRoom";
import type { Character } from "@/game/types";
import { InfluenceCard } from "./InfluenceCard";

type Props = {
  player: PlayerRow;
  isCurrent: boolean;
  isMe: boolean;
  isTarget?: boolean;
  myHand?: Character[];
  reactionStatus?: "responded" | "thinking";
  hideInfluences?: boolean;
};

export function PlayerSeat({
  player,
  isCurrent,
  isMe,
  isTarget,
  myHand,
  reactionStatus,
  hideInfluences = false,
}: Props) {
  const initials = player.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const handSize =
    isMe && !hideInfluences ? (myHand?.length ?? 0) : Math.max(0, 2 - player.revealed.length);
  const seatHue = (player.seat * 67) % 360;
  const seatState = !player.is_alive
    ? "Eliminado"
    : isCurrent
      ? "Turno atual"
      : isTarget
        ? "Alvo selecionado"
        : undefined;
  const reactionLabel =
    reactionStatus === "responded"
      ? "Já reagiu"
      : reactionStatus === "thinking"
        ? "Ainda está pensando"
        : undefined;

  return (
    <section
      aria-label={`${player.name}${isMe ? ", você" : ""}${seatState ? ` — ${seatState}` : ""}${reactionLabel ? ` — ${reactionLabel}` : ""}`}
      className={`relative flex min-w-0 flex-col items-center gap-1.5 rounded-lg border-2 p-2.5 text-[var(--pop-ink,#101114)] shadow-[3px_3px_0_var(--pop-ink,#101114)] transition-[transform,filter] motion-reduce:transition-none ${
        isCurrent
          ? "-translate-y-1 border-[var(--pop-warning,#f4b900)] bg-[var(--pop-panel,#fff5dc)] ring-2 ring-[var(--pop-ink,#101114)]"
          : "border-[var(--pop-ink,#101114)] bg-[var(--pop-paper,#f5f0e5)]"
      } ${isTarget ? "ring-4 ring-[var(--pop-danger,#d7193f)] ring-offset-2" : ""} ${reactionStatus === "responded" ? "outline-[4px] outline-offset-2 outline-[var(--pop-info,#087985)]" : ""} ${!player.is_alive ? "opacity-60 grayscale" : ""}`}
    >
      {reactionStatus && (
        <span
          className={`absolute -top-3 left-2 z-10 grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--pop-ink,#101114)] font-display text-sm font-black shadow-[2px_2px_0_var(--pop-ink,#101114)] ${
            reactionStatus === "responded"
              ? "bg-[var(--pop-info,#087985)] text-white"
              : "bg-[var(--pop-warning,#f4b900)] text-[var(--pop-ink,#101114)]"
          }`}
          aria-label={reactionLabel}
          title={reactionLabel}
        >
          {reactionStatus === "responded" ? "✓" : "…"}
        </span>
      )}
      {seatState && (
        <span
          className={`absolute -top-3 right-2 rotate-2 border-2 border-[var(--pop-ink,#101114)] px-2 py-0.5 font-display text-[10px] font-black uppercase shadow-[2px_2px_0_var(--pop-ink,#101114)] ${isTarget ? "bg-[var(--pop-danger,#d7193f)] text-white" : "bg-[var(--pop-warning,#f4b900)]"}`}
        >
          {seatState}
        </span>
      )}

      <div className="flex w-full items-center gap-2">
        <div
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-[var(--pop-ink,#101114)] font-display text-xs font-black text-white shadow-[2px_2px_0_var(--pop-ink,#101114)] sm:h-10 sm:w-10"
          style={{ backgroundColor: `hsl(${seatHue} 58% 38%)` }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-sm font-black uppercase">
            {player.name}
            {isMe && <span className="text-[var(--pop-info,#087985)]"> · você</span>}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs font-bold tabular-nums">
            <span
              aria-hidden="true"
              className="inline-grid h-4 w-4 place-items-center rounded-full border border-[var(--pop-ink,#101114)] bg-[var(--pop-warning,#f4b900)] text-[8px]"
            >
              $
            </span>
            <span aria-label={`${player.coins} moedas`}>{player.coins}</span>
            <span aria-hidden="true" className="mx-1 opacity-40">
              /
            </span>
            <span>
              {handSize} carta{handSize !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      <div
        className="flex min-h-12 max-w-full flex-wrap justify-center gap-1.5"
        aria-label="Influências"
      >
        {(!isMe || hideInfluences) &&
          Array.from({ length: handSize }).map((_, index) => (
            <InfluenceCard key={`hidden-${index}`} faceDown size="sm" />
          ))}
        {isMe &&
          !hideInfluences &&
          (myHand ?? []).map((character, index) => (
            <InfluenceCard key={`own-${character}-${index}`} character={character} size="sm" />
          ))}
        {player.revealed.map((character, index) => (
          <InfluenceCard
            key={`revealed-${character}-${index}`}
            character={character}
            revealed
            eliminated={!player.is_alive}
            size="sm"
          />
        ))}
      </div>
    </section>
  );
}
