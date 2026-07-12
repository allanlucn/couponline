import type { PlayerRow } from "@/hooks/useCoupRoom";
import { InfluenceCard } from "./InfluenceCard";
import type { Character } from "@/game/types";

type Props = {
  player: PlayerRow;
  isCurrent: boolean;
  isMe: boolean;
  isTarget?: boolean;
  myHand?: Character[];
};

export function PlayerSeat({ player, isCurrent, isMe, isTarget, myHand }: Props) {
  const initials = player.name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const handSize = isMe ? (myHand?.length ?? 0) : 2 - player.revealed.length;
  return (
    <div
      className={`relative flex flex-col items-center gap-2 p-3 rounded-lg transition-all ${
        isCurrent ? "bg-[oklch(0.75_0.11_80/0.08)] ring-1 ring-[var(--brass)] anim-glow" : "bg-white/[0.02]"
      } ${!player.is_alive ? "opacity-40 grayscale" : ""} ${isTarget ? "ring-2 ring-[var(--bordeaux)]" : ""}`}
    >
      <div className="flex items-center gap-2 w-full">
        <div
          className="w-10 h-10 rounded-full grid place-items-center font-display font-bold text-sm shrink-0"
          style={{
            background: `conic-gradient(from ${(player.seat * 60) % 360}deg, oklch(0.5 0.12 ${(player.seat * 60) % 360}), oklch(0.35 0.1 ${(player.seat * 60 + 40) % 360}))`,
            color: "var(--ivory)",
          }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{player.name}{isMe && <span className="text-[var(--brass)]"> · você</span>}</div>
          <div className="tabular text-xs text-muted-foreground flex items-center gap-1">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: "var(--brass)" }} />
            <span className="tabular">{player.coins}</span>
            <span className="ml-2 opacity-60">{handSize} carta{handSize !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>
      <div className="flex gap-1">
        {isMe
          ? (myHand ?? []).map((c, i) => <InfluenceCard key={i} character={c} size="sm" />)
          : Array.from({ length: handSize }).map((_, i) => <InfluenceCard key={i} faceDown size="sm" />)}
        {player.revealed.map((c, i) => (
          <InfluenceCard key={`r${i}`} character={c} revealed size="sm" />
        ))}
      </div>
    </div>
  );
}
