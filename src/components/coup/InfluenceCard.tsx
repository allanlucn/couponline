import type { Character } from "@/game/types";
import { CHARACTER_META } from "@/game/types";
import { CharacterIcon } from "./CharacterIcon";

type Props = {
  character?: Character;
  faceDown?: boolean;
  revealed?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES = {
  sm: "w-10 h-14 text-[8px]",
  md: "w-16 h-24 text-[10px]",
  lg: "w-24 h-36 text-xs",
};

export function InfluenceCard({ character, faceDown, revealed, size = "md", className = "" }: Props) {
  const showBack = faceDown && !revealed;
  return (
    <div
      className={`card-3d relative ${SIZES[size]} ${className} ${revealed ? "opacity-70 anim-shake" : ""}`}
      style={{ transformStyle: "preserve-3d" }}
    >
      <div
        className="absolute inset-0 rounded-md overflow-hidden border border-black/40"
        style={{
          background: showBack
            ? "repeating-linear-gradient(45deg, oklch(0.32 0.05 15), oklch(0.32 0.05 15) 6px, oklch(0.28 0.05 15) 6px, oklch(0.28 0.05 15) 12px)"
            : "linear-gradient(180deg, oklch(0.94 0.03 82), oklch(0.86 0.05 70))",
        }}
      >
        {showBack ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="wax-seal w-8 h-8 rounded-full flex items-center justify-center font-display font-black text-[oklch(0.95_0.05_60)]"
              aria-hidden
            >
              C
            </div>
          </div>
        ) : character ? (
          <div className="absolute inset-0 flex flex-col items-center justify-between p-1.5 text-[oklch(0.22_0.05_30)]">
            <div className="w-full text-center font-display font-bold uppercase tracking-wider">
              {CHARACTER_META[character].name}
            </div>
            <CharacterIcon character={character} className="w-3/4 h-3/4 opacity-90" />
            <div className="w-full text-center text-[0.6em] italic opacity-70">
              {CHARACTER_META[character].action ?? CHARACTER_META[character].blocks}
            </div>
          </div>
        ) : null}
      </div>
      {revealed && (
        <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full wax-seal anim-seal-crack" aria-label="revelada" />
      )}
    </div>
  );
}
