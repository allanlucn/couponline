import type { Character } from "@/game/types";

const props = { fill: "currentColor", stroke: "none" } as const;

export function CharacterIcon({ character, className }: { character: Character; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-label={character}>
      {character === "duke" && (
        <g {...props}>
          <path d="M12 40l6-16 6 8 8-14 8 14 6-8 6 16z" />
          <circle cx="18" cy="24" r="2" />
          <circle cx="32" cy="10" r="2.5" />
          <circle cx="46" cy="24" r="2" />
          <rect x="12" y="42" width="40" height="6" rx="1" />
          <rect x="16" y="48" width="32" height="4" opacity="0.5" />
        </g>
      )}
      {character === "assassin" && (
        <g {...props}>
          <path d="M32 6c-8 4-14 12-14 22 0 4 1 8 3 12l-3 12h28l-3-12c2-4 3-8 3-12 0-10-6-18-14-22z" />
          <path d="M22 30l10 4 10-4v6l-10 4-10-4z" opacity="0.65" fill="oklch(0.18 0.02 265)" />
          <path d="M30 40l2 8 2-8z" opacity="0.85" fill="oklch(0.9 0 0)" />
        </g>
      )}
      {character === "captain" && (
        <g {...props}>
          <circle cx="32" cy="20" r="8" />
          <path d="M32 28v20M22 44h20" strokeWidth="3" stroke="currentColor" fill="none" />
          <path d="M18 48c4 6 24 6 28 0" strokeWidth="3" stroke="currentColor" fill="none" />
          <path d="M32 6l3 6h-6z" />
        </g>
      )}
      {character === "ambassador" && (
        <g {...props}>
          <rect x="14" y="14" width="36" height="36" rx="2" />
          <path d="M14 20h36M14 44h36" stroke="oklch(0.18 0.02 265)" strokeWidth="1.5" fill="none" opacity="0.7" />
          <circle cx="32" cy="32" r="6" fill="oklch(0.42 0.13 15)" />
          <path d="M28 30l4 4 4-4-4-4z" fill="oklch(0.95 0.05 60)" />
        </g>
      )}
      {character === "contessa" && (
        <g {...props}>
          <path d="M32 8c-6 6-12 12-12 22 0 6 4 10 12 10s12-4 12-10c0-10-6-16-12-22z" />
          <circle cx="27" cy="26" r="1.5" fill="oklch(0.18 0.02 265)" />
          <circle cx="37" cy="26" r="1.5" fill="oklch(0.18 0.02 265)" />
          <path d="M28 32c2 2 6 2 8 0" stroke="oklch(0.18 0.02 265)" fill="none" strokeWidth="1.5" />
          <path d="M20 42l12 12 12-12-12 4z" opacity="0.7" />
        </g>
      )}
    </svg>
  );
}
