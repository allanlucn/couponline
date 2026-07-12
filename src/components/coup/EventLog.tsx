import type { EventRow } from "@/hooks/useCoupRoom";
import { useEffect, useRef, useState } from "react";

const LABEL: Record<string, (p: any, name: (id: string) => string) => string> = {
  game_started: () => "A partida começou.",
  action_declared: (p, n) => `${n(p.actor)} declarou ${p.action}${p.target ? ` em ${n(p.target)}` : ""}.`,
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

export function EventLog({ events, nameFor }: { events: EventRow[]; nameFor: (id: string) => string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [events]);
  return (
    <aside
      className={`fixed right-0 top-0 h-full z-30 transition-transform ${open ? "translate-x-0" : "translate-x-[calc(100%-2.5rem)]"}`}
      style={{ width: "min(320px, 90vw)" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="absolute left-0 top-4 -translate-x-full btn-ghost rounded-l-md px-2 py-3 text-xs writing-mode-vertical"
        style={{ writingMode: "vertical-rl" }}
        aria-label="alternar log"
      >
        {open ? "Fechar log" : "Log"}
      </button>
      <div className="h-full bg-[oklch(0.16_0.02_265)]/95 backdrop-blur border-l border-white/10 flex flex-col">
        <div className="p-3 border-b border-white/10 font-display font-bold text-sm">Crônica</div>
        <div ref={ref} className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
          {events.map((e) => {
            const fn = LABEL[e.type];
            return (
              <div key={e.id} className="anim-fade-up border-l-2 border-[var(--brass)]/40 pl-2">
                {fn ? fn(e.payload, nameFor) : e.type}
              </div>
            );
          })}
          {events.length === 0 && <div className="text-xs opacity-50">Sem eventos ainda.</div>}
        </div>
      </div>
    </aside>
  );
}
