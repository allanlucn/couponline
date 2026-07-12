import type { Character } from "@/game/types";
import { CHARACTER_META } from "@/game/types";
import assassinCard from "./Cartas/carta_assassino.png";
import captainCard from "./Cartas/carta_capitao.png";
import contessaCard from "./Cartas/carta_condessa.png";
import dukeCard from "./Cartas/carta_duque.png";
import ambassadorCard from "./Cartas/carta_embaixador.png";

type Props = {
  character?: Character;
  faceDown?: boolean;
  revealed?: boolean;
  selected?: boolean;
  blocked?: boolean;
  eliminated?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const CARD_IMAGES: Record<Character, string> = {
  assassin: assassinCard,
  captain: captainCard,
  contessa: contessaCard,
  duke: dukeCard,
  ambassador: ambassadorCard,
};

const SIZES = {
  sm: "w-14",
  md: "w-24 sm:w-28",
  lg: "w-32 sm:w-40 lg:w-44",
};

export function InfluenceCard({
  character,
  faceDown,
  revealed,
  selected,
  blocked,
  eliminated,
  size = "md",
  className = "",
}: Props) {
  const showBack = faceDown && !revealed;
  const characterName = character ? CHARACTER_META[character].name : undefined;
  const state = eliminated
    ? "eliminada"
    : revealed
      ? "revelada"
      : blocked
        ? "bloqueada"
        : selected
          ? "selecionada"
          : undefined;
  const label = showBack
    ? "Influência oculta"
    : characterName
      ? `${characterName}${state ? `, ${state}` : ""}`
      : "Espaço de influência vazio";

  return (
    <div
      role="img"
      aria-label={label}
      className={`group relative aspect-[4/5] shrink-0 overflow-hidden rounded-md border-2 border-[var(--pop-ink,#101114)] bg-[var(--pop-panel,#fff5dc)] shadow-[3px_3px_0_var(--pop-ink,#101114)] transition-[transform,filter] duration-150 motion-reduce:transition-none ${SIZES[size]} ${
        selected
          ? "-translate-y-1 rotate-1 outline-2 outline-offset-2 outline-[var(--pop-warning,#f4b900)]"
          : ""
      } ${revealed ? "grayscale-[.7] saturate-50" : ""} ${eliminated ? "opacity-50 grayscale" : ""} ${className}`}
    >
      {showBack ? (
        <div
          className="absolute inset-0 grid place-items-center bg-[var(--pop-danger,#d7193f)]"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--pop-paper, #f5f0e5) 1px, transparent 1.5px), repeating-linear-gradient(135deg, transparent 0 10px, rgb(16 17 20 / 35%) 10px 14px)",
            backgroundSize: "8px 8px, auto",
          }}
        >
          <div
            aria-hidden="true"
            className="grid aspect-square w-3/5 rotate-3 place-items-center border-2 border-[var(--pop-ink,#101114)] bg-[var(--pop-warning,#f4b900)] font-display text-[clamp(.75rem,3vw,1.5rem)] font-black text-[var(--pop-ink,#101114)] shadow-[3px_3px_0_var(--pop-ink,#101114)]"
          >
            C!
          </div>
        </div>
      ) : character ? (
        <img
          src={CARD_IMAGES[character]}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="h-full w-full bg-[repeating-linear-gradient(135deg,var(--pop-muted,#d7d0c1)_0_6px,var(--pop-paper,#f5f0e5)_6px_12px)]" />
      )}

      {(revealed || blocked || eliminated) && (
        <span className="absolute inset-x-[-12%] top-1/2 -rotate-6 border-y-2 border-[var(--pop-ink,#101114)] bg-[var(--pop-paper,#f5f0e5)] py-0.5 text-center font-display text-[clamp(.45rem,1.5vw,.7rem)] font-black uppercase tracking-wide text-[var(--pop-ink,#101114)]">
          {eliminated ? "Fora do jogo" : blocked ? "Bloqueada" : "Revelada"}
        </span>
      )}
    </div>
  );
}
