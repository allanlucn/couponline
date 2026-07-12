import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useCoupRoom } from "@/hooks/useCoupRoom";
import { applyAction, startGameFn } from "@/lib/coup.functions";
import { PlayerSeat } from "@/components/coup/PlayerSeat";
import { ActionDock } from "@/components/coup/ActionDock";
import { EventLog } from "@/components/coup/EventLog";
import { InfluenceCard } from "@/components/coup/InfluenceCard";
import { CharacterIcon } from "@/components/coup/CharacterIcon";
import type { Character } from "@/game/types";
import { CHARACTER_META, CHARACTERS } from "@/game/types";

export const Route = createFileRoute("/room/$code")({
  component: RoomPage,
});

function RoomPage() {
  const { code } = Route.useParams();
  const { room, players, events, myHand, myPlayerId, uid } = useCoupRoom(code);
  const apply = useServerFn(applyAction);
  const start = useServerFn(startGameFn);
  const [showRules, setShowRules] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exchangeKeep, setExchangeKeep] = useState<Character[]>([]);

  const nameFor = (id: string) => players.find((p) => p.id === id)?.name ?? "?";
  const me = players.find((p) => p.id === myPlayerId);
  const isHost = room && me && room.host_id === me.id;

  async function doAction(action: any) {
    setError(null);
    try {
      await apply({ data: { roomId: room!.id, action } });
    } catch (e: any) {
      setError(e?.message ?? "Erro");
    }
  }

  if (!room) {
    return (
      <main className="min-h-screen grid place-items-center">
        <div className="text-center opacity-70">Carregando sala…</div>
      </main>
    );
  }

  // ============ LOBBY ============
  if (room.status === "lobby") {
    return (
      <main className="min-h-screen px-4 py-10">
        <div className="max-w-2xl mx-auto">
          <Link to="/" className="text-xs opacity-60 hover:opacity-100">← Sair</Link>
          <div className="mt-4 text-center">
            <h2 className="font-display text-3xl font-black">Antecâmara</h2>
            <p className="text-sm text-muted-foreground mt-1">Compartilhe o código com quem for jogar.</p>
            <div className="mt-4 inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-4 py-3">
              <span className="text-xs uppercase tracking-widest opacity-60">Código</span>
              <span className="font-mono text-2xl tracking-[0.4em] font-bold">{code.toUpperCase()}</span>
              <button
                onClick={() => navigator.clipboard.writeText(code.toUpperCase())}
                className="btn-ghost rounded-md px-2 py-1 text-xs"
              >Copiar</button>
            </div>
          </div>

          <div className="mt-8 space-y-2">
            <div className="text-xs uppercase tracking-widest opacity-60">Convidados ({players.length}/6)</div>
            {players.map((p) => (
              <div key={p.id} className="flex items-center gap-3 bg-white/5 rounded-md px-3 py-2 anim-fade-up">
                <div
                  className="w-8 h-8 rounded-full grid place-items-center font-display font-bold text-xs"
                  style={{ background: `conic-gradient(from ${p.seat * 60}deg, oklch(0.5 0.12 ${p.seat * 60}), oklch(0.35 0.1 ${p.seat * 60 + 40}))` }}
                >{p.name.slice(0, 2).toUpperCase()}</div>
                <span className="font-medium">{p.name}</span>
                {p.id === room.host_id && <span className="text-xs text-[var(--brass)] ml-auto">host</span>}
                {p.id === myPlayerId && <span className="text-xs opacity-60">você</span>}
              </div>
            ))}
          </div>

          {isHost ? (
            <button
              onClick={async () => {
                setError(null);
                try { await start({ data: { roomId: room.id } }); }
                catch (e: any) { setError(e?.message ?? "Erro"); }
              }}
              disabled={players.length < 2}
              className="btn-primary mt-8 w-full rounded-md py-3 font-semibold"
            >
              {players.length < 2 ? "Aguardando ao menos 2 nobres" : "Iniciar a partida"}
            </button>
          ) : (
            <div className="mt-8 text-center text-sm text-muted-foreground">Aguardando o host iniciar…</div>
          )}
          {error && <div className="mt-3 text-sm text-[var(--bordeaux)]">{error}</div>}
        </div>
      </main>
    );
  }

  const pending = room.state?.pending ?? null;
  const targetId = pending?.targetId;

  // ============ GAME ============
  return (
    <main className="min-h-screen pb-40 pr-0 sm:pr-4">
      <header className="p-4 flex items-center gap-3">
        <Link to="/" className="text-xs opacity-60 hover:opacity-100">← Sair</Link>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className="opacity-60">Sala</span>
          <span className="font-mono tracking-widest">{code.toUpperCase()}</span>
          <button onClick={() => setShowRules(true)} className="btn-ghost rounded-md px-2 py-1 ml-2">Regras</button>
        </div>
      </header>

      {room.status === "finished" && (
        <VictoryScene winnerName={nameFor(room.winner_id ?? "")} />
      )}

      <section className="max-w-5xl mx-auto px-4">
        {/* Mesa oval */}
        <div className="relative mx-auto my-6 rounded-[50%] border-4 border-[oklch(0.35_0.08_25)] p-6 sm:p-10 bg-gradient-to-br from-[oklch(0.28_0.05_25)] to-[oklch(0.18_0.03_15)] shadow-vault min-h-[280px] hidden sm:block">
          <div className="absolute inset-6 rounded-[50%] border border-[var(--brass)]/30" />
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="text-center opacity-60">
              <div className="font-display italic text-[oklch(0.85_0.06_60)] text-xl">Corte</div>
              <div className="tabular text-xs mt-1">Turno: {nameFor(room.current_player_id ?? "")}</div>
            </div>
          </div>
          <div className="relative grid grid-cols-2 sm:grid-cols-3 gap-3">
            {players.map((p) => (
              <PlayerSeat
                key={p.id}
                player={p}
                isCurrent={room.current_player_id === p.id}
                isMe={p.id === myPlayerId}
                isTarget={targetId === p.id}
                myHand={p.id === myPlayerId ? myHand : undefined}
              />
            ))}
          </div>
        </div>
        {/* Mobile stacked */}
        <div className="sm:hidden space-y-2">
          <div className="text-center text-xs opacity-60">Turno: {nameFor(room.current_player_id ?? "")}</div>
          {players.map((p) => (
            <PlayerSeat
              key={p.id}
              player={p}
              isCurrent={room.current_player_id === p.id}
              isMe={p.id === myPlayerId}
              isTarget={targetId === p.id}
              myHand={p.id === myPlayerId ? myHand : undefined}
            />
          ))}
        </div>

        {/* Reveal picker */}
        {pending?.phase === "lose_influence" && pending.loseInfluence?.playerId === myPlayerId && (
          <div className="mt-6 mx-auto max-w-lg parchment rounded-lg p-4 anim-fade-up">
            <div className="font-display text-lg mb-1">Perca uma influência</div>
            <p className="text-xs opacity-70 mb-3">Escolha qual carta revelar — ela sai do jogo permanentemente.</p>
            <div className="flex gap-3 justify-center">
              {myHand.map((c, i) => (
                <button
                  key={i}
                  onClick={() => doAction({ kind: "reveal", playerId: myPlayerId, character: c })}
                  className="hover:scale-105 transition-transform"
                >
                  <InfluenceCard character={c} size="md" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Exchange picker */}
        {pending?.phase === "exchange_pick" && pending.actorId === myPlayerId && (
          <ExchangePicker
            myHand={myHand}
            drawn={pending.exchangeCards ?? []}
            handSize={myHand.length}
            onSubmit={(keep) => doAction({ kind: "exchange_return", playerId: myPlayerId, keep })}
          />
        )}
      </section>

      <ActionDock
        players={players}
        myPlayerId={myPlayerId}
        currentPlayerId={room.current_player_id}
        pending={pending}
        myCoins={me?.coins ?? 0}
        onAction={doAction}
      />

      <EventLog events={events} nameFor={nameFor} />

      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-[var(--bordeaux)] text-[var(--ivory)] rounded-md px-4 py-2 text-sm z-40 anim-fade-up">
          {error}
        </div>
      )}

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </main>
  );
}

function ExchangePicker({
  myHand,
  drawn,
  handSize,
  onSubmit,
}: {
  myHand: Character[];
  drawn: Character[];
  handSize: number;
  onSubmit: (keep: Character[]) => void;
}) {
  const pool = [...myHand, ...drawn];
  const [selected, setSelected] = useState<number[]>([]);
  const toggle = (i: number) => {
    setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : s.length < handSize ? [...s, i] : s));
  };
  return (
    <div className="mt-6 mx-auto max-w-xl parchment rounded-lg p-4 anim-fade-up">
      <div className="font-display text-lg mb-1">Trocar cartas</div>
      <p className="text-xs opacity-70 mb-3">Escolha {handSize} carta{handSize > 1 ? "s" : ""} para manter. As demais voltam ao baralho.</p>
      <div className="flex flex-wrap gap-3 justify-center">
        {pool.map((c, i) => (
          <button
            key={i}
            onClick={() => toggle(i)}
            className={`transition-transform ${selected.includes(i) ? "ring-2 ring-[var(--bordeaux)] scale-105" : "opacity-70 hover:opacity-100"}`}
          >
            <InfluenceCard character={c} size="md" />
          </button>
        ))}
      </div>
      <button
        disabled={selected.length !== handSize}
        onClick={() => onSubmit(selected.map((i) => pool[i]))}
        className="btn-primary mt-4 w-full rounded-md py-2 text-sm font-semibold"
      >
        Confirmar
      </button>
    </div>
  );
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70" onClick={onClose}>
      <div className="max-w-2xl w-full parchment rounded-lg p-6 max-h-[85vh] overflow-y-auto anim-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl font-black">A corte e suas máscaras</h2>
          <button onClick={onClose} className="text-lg">×</button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          {CHARACTERS.map((c) => (
            <div key={c} className="bg-white/40 rounded-md p-3 flex gap-3 items-start">
              <CharacterIcon character={c} className="w-10 h-10 shrink-0 text-[oklch(0.28_0.08_25)]" />
              <div>
                <div className="font-display font-bold">{CHARACTER_META[c].name}</div>
                {CHARACTER_META[c].action && <div className="text-xs">Ação: {CHARACTER_META[c].action}</div>}
                {CHARACTER_META[c].blocks && <div className="text-xs">Bloqueia: {CHARACTER_META[c].blocks}</div>}
              </div>
            </div>
          ))}
        </div>
        <div className="text-sm space-y-2 text-[oklch(0.25_0.05_30)]">
          <p><b>Renda:</b> +1 moeda. Nunca bloqueável nem desafiável.</p>
          <p><b>Ajuda Externa:</b> +2 moedas. Pode ser bloqueada por Duque.</p>
          <p><b>Golpe:</b> paga 7 moedas, alvo perde 1 influência. Obrigatório com 10+ moedas.</p>
          <p><b>Desafio:</b> qualquer ação/bloqueio ligado a um personagem pode ser contestado. Quem estiver blefando perde 1 influência; se realmente tem a carta, quem desafiou perde 1 e o autor troca a carta pelo baralho.</p>
          <p>Você é eliminado ao perder suas 2 influências. Vence quem sobrar.</p>
        </div>
      </div>
    </div>
  );
}

function VictoryScene({ winnerName }: { winnerName: string }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/80 backdrop-blur">
      <div className="text-center anim-fade-up">
        <div className="wax-seal w-32 h-32 mx-auto rounded-full grid place-items-center font-display text-6xl">👑</div>
        <div className="mt-6 font-display text-5xl font-black text-[var(--brass)]">{winnerName}</div>
        <div className="mt-2 text-sm opacity-80">venceu a corte</div>
        <Link to="/" className="btn-primary inline-block mt-6 rounded-md px-6 py-3 text-sm font-semibold">
          Nova partida
        </Link>
      </div>
    </div>
  );
}
