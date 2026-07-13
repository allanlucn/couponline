import type { EventRow } from "@/hooks/useCoupRoom";
import { useEffect, useRef, useState } from "react";

// Event payloads are persisted JSON with a shape determined by each event type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LABEL: Record<string, (p: any, name: (id: string) => string) => string> = {
  game_started: () => "A partida começou.",
  action_declared: (p, n) =>
    `${n(p.actor)} declarou ${p.action}${p.target ? ` em ${n(p.target)}` : ""}.`,
  income: (p, n) => `${n(p.player)} recebeu +1 (Renda).`,
  foreign_aid: (p, n) => `${n(p.player)} recebeu +2 (Ajuda Externa).`,
  tax: (p, n) => `${n(p.player)} recebeu +3 (Taxar).`,
  steal: (p, n) => `${n(p.to)} extorquiu ${p.amount} de ${n(p.from)}.`,
  challenge_declared: (p, n) => `${n(p.challenger)} desafiou ${n(p.claimant)} (${p.character}).`,
  challenge_failed: (p, n) => `Desafio falhou — ${n(p.challenger)} pagará.`,
  bluff_caught: (p, n) => `Blefe descoberto! ${n(p.claimant)} não tinha ${p.character}.`,
  block_declared: (p, n) => `${n(p.blocker)} bloqueou com ${p.character}.`,
  block_success: (p) => `Bloqueio confirmado (${p.action}).`,
  influence_lost: (p, n) => `${n(p.player)} perdeu ${p.character}.`,
  exchange_draw: (p, n) => `${n(p.player)} comprou 2 cartas.`,
  exchange_done: (p, n) => `${n(p.player)} devolveu ao baralho.`,
  game_over: (p, n) => `Vitória de ${n(p.winner)}!`,
};

export function EventLog({
  events,
  nameFor,
}: {
  events: EventRow[];
  nameFor: (id: string) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [events]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed right-3 top-20 z-30 flex min-h-11 items-center justify-center gap-2 border-[3px] border-[var(--pop-ink,#101114)] bg-[var(--pop-warning,#f4b900)] px-3 py-2 font-display text-sm font-black uppercase tracking-wide text-[var(--pop-ink,#101114)] shadow-[4px_4px_0_var(--pop-ink,#101114)] transition-transform hover:-translate-y-1 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--pop-focus,#3478f6)] motion-reduce:transition-none sm:right-4 sm:min-w-32 sm:text-base"
        aria-label="Abrir histórico da partida"
        aria-expanded={open}
        aria-controls="action-history"
      >
        <span aria-hidden="true" className="text-lg">
          ☰
        </span>
        Histórico
      </button>
      {open && (
        <div className="fixed inset-0 z-[70]">
          <button
            className="absolute inset-0 h-full w-full cursor-default bg-black/60"
            onClick={() => setOpen(false)}
            aria-label="Fechar histórico"
          />
          <aside
            id="action-history"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-title"
            className="anim-fade-up absolute inset-x-2 bottom-2 top-auto max-h-[min(75vh,42rem)] border-[3px] border-[var(--pop-ink,#101114)] bg-[var(--pop-panel,#fff5dc)] text-[var(--pop-ink,#101114)] shadow-[7px_7px_0_var(--pop-ink,#101114)] sm:inset-y-4 sm:left-auto sm:right-4 sm:max-h-none sm:w-[min(22rem,calc(100vw-2rem))]"
          >
            <div className="flex items-center justify-between gap-3 border-b-[3px] border-[var(--pop-ink,#101114)] bg-[var(--pop-danger,#d7193f)] p-3 text-white">
              <h2 id="history-title" className="font-display text-lg font-bold uppercase">
                Histórico
              </h2>
              <button
                ref={closeRef}
                onClick={() => setOpen(false)}
                className="min-h-14 min-w-14 border-[3px] border-[var(--pop-ink,#101114)] bg-[var(--pop-white,#fffdf7)] px-3 text-xl font-black text-[var(--pop-ink,#101114)] shadow-[3px_3px_0_var(--pop-ink,#101114)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-[var(--pop-focus,#3478f6)]"
                aria-label="Fechar histórico"
              >
                ✕
              </button>
            </div>
            <div
              ref={ref}
              className="max-h-[calc(75vh-4.5rem)] overflow-y-auto p-3 text-sm sm:h-[calc(100%-4.5rem)] sm:max-h-none"
              aria-live="polite"
            >
              <ol className="space-y-2">
                {events.map((e) => {
                  const fn = LABEL[e.type];
                  return (
                    <li
                      key={e.id}
                      className="anim-fade-up border-l-4 border-[var(--pop-warning,#f4b900)] bg-[var(--pop-white,#fffdf7)] p-2 font-medium"
                    >
                      {fn ? fn(e.payload, nameFor) : e.type}
                    </li>
                  );
                })}
              </ol>
              {events.length === 0 && (
                <div className="border-2 border-dashed border-current p-4 text-center text-xs font-bold">
                  Sem eventos ainda.
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
