import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import type { ComponentProps } from "react";
import { useCoupRoom, type PlayerRow } from "@/hooks/useCoupRoom";
import {
  applyAction,
  joinRoom,
  restartGameFn,
  startGameFn,
  updateRoomTimeout,
} from "@/lib/coup.functions";
import { PlayerSeat } from "@/components/coup/PlayerSeat";
import { ActionDock } from "@/components/coup/ActionDock";
import { EventLog } from "@/components/coup/EventLog";
import { InfluenceCard } from "@/components/coup/InfluenceCard";
import type { Character, PendingAction } from "@/game/types";
import { CHARACTER_META, CHARACTERS } from "@/game/types";

export const Route = createFileRoute("/room/$code")({
  component: RoomPage,
});

function RoomPage() {
  const { code } = Route.useParams();
  const { room, players, events, myHand, myPendingCards, myPlayerId, uid, identityResolved } =
    useCoupRoom(code);
  const apply = useServerFn(applyAction);
  const start = useServerFn(startGameFn);
  const restart = useServerFn(restartGameFn);
  const updateTimeout = useServerFn(updateRoomTimeout);
  const join = useServerFn(joinRoom);
  const [showRules, setShowRules] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(20);
  const [shuffleSecondsLeft, setShuffleSecondsLeft] = useState(0);
  const [lobbyTimeoutDraft, setLobbyTimeoutDraft] = useState(20);
  const [directJoinName, setDirectJoinName] = useState("");
  const [joiningDirectly, setJoiningDirectly] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const nameFor = (id: string) => players.find((p) => p.id === id)?.name ?? "?";
  const me = players.find((p) => p.id === myPlayerId);
  const isHost = room && me && room.host_id === me.id;

  async function doAction(action: Parameters<ComponentProps<typeof ActionDock>["onAction"]>[0]) {
    setError(null);
    try {
      await apply({ data: { roomId: room!.id, action } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Erro");
    }
  }

  useEffect(() => {
    const deadlineAt = room?.state.deadlineAt;
    if (!room || room.status !== "playing" || !deadlineAt) return;
    let fired = false;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((Date.parse(deadlineAt) - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0 && !fired) {
        fired = true;
        apply({ data: { roomId: room.id, action: { kind: "timeout", deadlineAt } } }).catch(() => {
          fired = false;
        });
      }
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [apply, room]);

  useEffect(() => {
    const readyAt = room?.state.readyAt;
    if (!room || room.status !== "playing" || !readyAt) {
      setShuffleSecondsLeft(0);
      return;
    }
    const tick = () => {
      setShuffleSecondsLeft(Math.max(0, Math.ceil((Date.parse(readyAt) - Date.now()) / 1000)));
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [room]);

  useEffect(() => {
    if (room?.status === "lobby") {
      setLobbyTimeoutDraft(room.state.actionTimeoutSeconds ?? 20);
    }
  }, [room?.id, room?.state.actionTimeoutSeconds, room?.status]);

  useEffect(() => {
    if (room?.status === "playing") setRestarting(false);
  }, [room?.status]);

  useEffect(() => {
    if (
      !room ||
      room.status !== "lobby" ||
      !isHost ||
      lobbyTimeoutDraft === (room.state.actionTimeoutSeconds ?? 20)
    ) {
      return;
    }

    const debounce = window.setTimeout(() => {
      updateTimeout({
        data: { roomId: room.id, actionTimeoutSeconds: lobbyTimeoutDraft },
      }).catch((caught) => setError(caught instanceof Error ? caught.message : "Erro"));
    }, 450);

    return () => window.clearTimeout(debounce);
  }, [isHost, lobbyTimeoutDraft, room, updateTimeout]);

  if (!room) {
    return (
      <main className="min-h-screen grid place-items-center">
        <div className="text-center opacity-70">Carregando sala…</div>
      </main>
    );
  }

  async function handleDirectJoin() {
    if (!directJoinName.trim() || joiningDirectly || !uid) return;
    setJoiningDirectly(true);
    setError(null);
    try {
      const result = await join({
        data: { code: code.toUpperCase(), name: directJoinName.trim() },
      });
      sessionStorage.setItem(`coup:player:${result.code}`, result.playerId);
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível entrar");
      setJoiningDirectly(false);
    }
  }

  if (identityResolved && !myPlayerId) {
    if (room.status !== "lobby") {
      return (
        <main className="pop-shell grid min-h-screen place-items-center px-4">
          <section className="pop-panel max-w-lg p-6 text-center sm:p-8">
            <span className="pop-kicker">Partida em andamento</span>
            <h1 className="mt-5 font-display text-4xl font-black uppercase">Entrada encerrada</h1>
            <p className="mt-3 font-semibold">Esta sala já iniciou e não aceita novos jogadores.</p>
            <Link to="/" className="btn-primary mt-6 inline-flex px-6 py-3 font-black uppercase">
              Voltar ao início
            </Link>
          </section>
        </main>
      );
    }

    return (
      <main className="pop-shell grid min-h-screen place-items-center px-4 py-10">
        <section className="pop-panel w-full max-w-lg p-6 sm:p-8">
          <span className="pop-kicker -rotate-1">Convite recebido!</span>
          <h1 className="mt-5 font-display text-4xl font-black uppercase sm:text-5xl">
            Entre na sala
          </h1>
          <p className="mt-2 font-semibold">
            Sala <strong className="font-mono tracking-widest">{code.toUpperCase()}</strong>
          </p>
          <label
            htmlFor="direct-join-name"
            className="mt-6 block text-xs font-black uppercase tracking-wider"
          >
            Seu codinome
          </label>
          <input
            id="direct-join-name"
            value={directJoinName}
            onChange={(event) => setDirectJoinName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleDirectJoin();
            }}
            maxLength={24}
            placeholder="Ex.: Raposa Escarlate"
            className="pop-input mt-2"
            autoFocus
          />
          <button
            type="button"
            disabled={joiningDirectly || !uid || !directJoinName.trim()}
            onClick={handleDirectJoin}
            className="btn-primary mt-6 min-h-14 w-full px-5 py-3 font-black uppercase"
          >
            {joiningDirectly ? "Entrando..." : "Entrar na sala"}
          </button>
          {error && (
            <div
              role="alert"
              className="mt-4 border-3 border-[var(--pop-ink)] bg-[var(--pop-danger)] px-3 py-2 font-bold text-white"
            >
              {error}
            </div>
          )}
        </section>
      </main>
    );
  }

  // ============ LOBBY ============
  if (room.status === "lobby") {
    return (
      <main className="pop-shell min-h-screen px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <ExitRoomLink />
          <div className="mt-4 text-center pop-panel p-5 sm:p-7">
            <h2 className="font-display text-3xl font-black">Antecâmara</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Compartilhe o código com quem for jogar.
            </p>
            <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-2 border-3 border-[var(--pop-ink)] bg-[var(--pop-warning)] px-4 py-3 shadow-[4px_4px_0_var(--pop-ink)]">
              <span className="text-xs uppercase tracking-widest opacity-60">Código</span>
              <span className="font-mono text-2xl tracking-[0.4em] font-bold">
                {code.toUpperCase()}
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(code.toUpperCase())}
                className="btn-ghost rounded-md px-2 py-1 text-xs"
              >
                Copiar
              </button>
            </div>
          </div>

          <div className="mt-8 space-y-3 pop-panel p-4 sm:p-6">
            <div className="text-xs uppercase tracking-widest opacity-60">
              Convidados ({players.length}/6)
            </div>
            {players.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 border-3 border-[var(--pop-ink)] bg-[var(--pop-white)] px-3 py-2 shadow-[3px_3px_0_var(--pop-ink)] anim-fade-up"
              >
                <div
                  className="w-8 h-8 rounded-full grid place-items-center font-display font-bold text-xs"
                  style={{
                    background: `conic-gradient(from ${p.seat * 60}deg, oklch(0.5 0.12 ${p.seat * 60}), oklch(0.35 0.1 ${p.seat * 60 + 40}))`,
                  }}
                >
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
                <span className="font-medium">{p.name}</span>
                {p.id === room.host_id && (
                  <span className="text-xs text-[var(--brass)] ml-auto">host</span>
                )}
                {p.id === myPlayerId && <span className="text-xs opacity-60">você</span>}
              </div>
            ))}
          </div>

          <div className="pop-panel mt-5 p-4">
            <label
              htmlFor="lobby-turn-time"
              className="flex items-center justify-between font-display text-lg font-black uppercase"
            >
              <span>Tempo por ação</span>
              <span className="pop-badge pop-badge--blue">{lobbyTimeoutDraft}s</span>
            </label>
            <input
              id="lobby-turn-time"
              type="range"
              min={20}
              max={60}
              step={5}
              disabled={!isHost}
              value={lobbyTimeoutDraft}
              onChange={(event) => setLobbyTimeoutDraft(Number(event.target.value))}
              className="mt-3 h-3 w-full accent-[var(--pop-danger)] disabled:opacity-50"
            />
            {!isHost && <p className="mt-2 text-sm font-bold">Somente o host pode alterar.</p>}
          </div>

          {isHost ? (
            <button
              onClick={async () => {
                setError(null);
                try {
                  await start({ data: { roomId: room.id } });
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "Erro");
                }
              }}
              disabled={players.length < 2}
              className="btn-primary mt-8 w-full rounded-md py-3 font-semibold"
            >
              {players.length < 2 ? "Aguardando ao menos 2 nobres" : "Iniciar a partida"}
            </button>
          ) : (
            <div className="mt-8 text-center text-sm text-muted-foreground">
              Aguardando o host iniciar…
            </div>
          )}
          {error && <div className="mt-3 text-sm text-[var(--bordeaux)]">{error}</div>}
        </div>
      </main>
    );
  }

  const pending = (room.state?.pending ?? null) as PendingAction | null;
  const readyAtMs = room.state.readyAt ? Date.parse(room.state.readyAt) : 0;
  const isShuffling =
    room.status === "playing" &&
    Number.isFinite(readyAtMs) &&
    (shuffleSecondsLeft > 0 || readyAtMs > Date.now());
  const targetId = pending?.targetId;
  const showTablePending = Boolean(
    pending &&
    (pending.phase === "challenge_action" ||
      pending.phase === "block_window" ||
      pending.phase === "challenge_block" ||
      pending.phase === "resolving" ||
      pending.phase === "exchange_pick"),
  );
  const reactionClaimantId = pending
    ? pending.phase === "challenge_block"
      ? pending.block?.blockerId
      : pending.phase === "challenge_action" || pending.phase === "block_window"
        ? pending.actorId
        : undefined
    : undefined;

  // ============ GAME ============
  return (
    <main className="pop-shell min-h-screen pb-[26rem] sm:pb-[22rem] lg:flex lg:h-dvh lg:min-h-0 lg:flex-col lg:overflow-hidden lg:pb-[17rem]">
      <header className="sticky top-0 z-[60] flex shrink-0 items-center gap-3 border-b-3 border-[var(--pop-ink)] bg-[var(--pop-paper)]/95 p-3 backdrop-blur-sm sm:p-4 lg:py-2">
        <ExitRoomLink />
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className="opacity-60">Sala</span>
          <span className="font-mono tracking-widest">{code.toUpperCase()}</span>
          <button
            onClick={() => setShowRules(true)}
            className="btn-ghost rounded-md px-2 py-1 ml-2"
          >
            Regras
          </button>
        </div>
      </header>

      {room.status === "finished" && (
        <VictoryScene
          winnerName={nameFor(room.winner_id ?? "")}
          isHost={Boolean(isHost)}
          restarting={restarting}
          onRestart={async () => {
            if (restarting || !isHost) return;
            setRestarting(true);
            setError(null);
            try {
              await restart({ data: { roomId: room.id } });
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Não foi possível reiniciar");
              setRestarting(false);
            }
          }}
        />
      )}

      <section className="mx-auto w-full max-w-7xl px-3 sm:px-4 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        <TurnCarousel players={players} currentPlayerId={room.current_player_id} />

        <div className="mt-4 grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[17rem_minmax(0,1fr)] lg:pb-3">
          <aside aria-labelledby="players-title" className="min-w-0 lg:flex lg:min-h-0 lg:flex-col">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="players-title" className="font-display text-xl font-black uppercase">
                Jogadores
              </h2>
              <span className="pop-badge pop-badge--blue">
                {players.filter((p) => p.is_alive).length} vivos
              </span>
            </div>
            <div className="flex snap-x gap-3 overflow-x-auto px-1 pb-3 pt-4 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:overscroll-contain lg:pr-2">
              {players.map((p) => (
                <div key={p.id} className="w-64 shrink-0 snap-start lg:w-full">
                  <PlayerSeat
                    player={p}
                    isCurrent={room.current_player_id === p.id}
                    isMe={p.id === myPlayerId}
                    isTarget={targetId === p.id}
                    myHand={p.id === myPlayerId ? myHand : undefined}
                    hideInfluences={isShuffling}
                    reactionStatus={
                      reactionClaimantId && p.is_alive && p.id !== reactionClaimantId
                        ? pending?.passed.includes(p.id)
                          ? "responded"
                          : "thinking"
                        : undefined
                    }
                  />
                </div>
              ))}
            </div>
          </aside>

          <div className="relative order-first flex min-h-48 flex-col items-center justify-center gap-4 overflow-hidden border-[4px] border-[var(--pop-ink)] bg-[var(--pop-info)] p-4 shadow-[7px_7px_0_var(--pop-ink)] pop-halftone lg:order-none lg:h-full lg:min-h-0 lg:w-full lg:p-6">
            <div className="absolute inset-5 border-[3px] border-[var(--pop-paper)]/75" />
            {isShuffling ? (
              <div
                className="relative z-10 text-center text-white"
                role="status"
                aria-live="polite"
              >
                <span className="pop-kicker">Preparando a mesa</span>
                <h2 className="mt-5 font-display text-4xl font-black uppercase [text-shadow:3px_3px_0_var(--pop-ink)] sm:text-6xl">
                  Embaralhando...
                </h2>
                <p className="mt-3 text-sm font-black uppercase sm:text-base">
                  As influências serão reveladas quando todos estiverem prontos
                </p>
                <div className="mx-auto mt-5 inline-flex min-w-24 items-center justify-center border-[3px] border-[var(--pop-ink)] bg-[var(--pop-warning)] px-4 py-2 font-display text-2xl font-black text-[var(--pop-ink)] shadow-[4px_4px_0_var(--pop-ink)]">
                  {Math.max(1, shuffleSecondsLeft)}s
                </div>
              </div>
            ) : showTablePending ? (
              <div className="relative z-10 flex w-full flex-col items-center gap-5">
                {pending?.phase === "exchange_pick" ? (
                  pending.actorId === myPlayerId ? (
                    <ExchangePicker
                      myHand={myHand}
                      drawn={myPendingCards}
                      handSize={myHand.length}
                      onSubmit={(keep) =>
                        doAction({ kind: "exchange_return", playerId: myPlayerId, keep })
                      }
                      embedded
                    />
                  ) : (
                    <div className="text-center text-white">
                      <span className="pop-kicker inline-block text-xs">Ação na mesa</span>
                      <h2 className="mt-4 font-display text-3xl uppercase [text-shadow:3px_3px_0_var(--pop-ink)] sm:text-5xl">
                        {nameFor(pending.actorId)}
                      </h2>
                      <p className="mt-2 font-display text-lg uppercase">está trocando cartas</p>
                    </div>
                  )
                ) : (
                  <ActionDock
                    players={players}
                    myPlayerId={myPlayerId}
                    currentPlayerId={room.current_player_id}
                    pending={pending}
                    myCoins={me?.coins ?? 0}
                    myHand={myHand}
                    onAction={doAction}
                    embedded
                  />
                )}
                <div
                  className={`inline-flex min-w-24 items-center justify-center border-[3px] border-[var(--pop-ink)] px-4 py-2 font-display text-2xl font-black shadow-[4px_4px_0_var(--pop-ink)] ${
                    secondsLeft <= 5
                      ? "bg-[var(--pop-danger)] text-white"
                      : "bg-[var(--pop-warning)] text-[var(--pop-ink)]"
                  }`}
                  aria-live="polite"
                  aria-label={`${secondsLeft} segundos restantes`}
                >
                  {secondsLeft}s
                </div>
              </div>
            ) : (
              <div className="relative z-10 text-center text-white">
                <span className="pop-kicker">Na mesa!</span>
                <div className="mt-4 font-display text-3xl font-black uppercase [text-shadow:3px_3px_0_var(--pop-ink)] sm:text-4xl lg:text-5xl">
                  {nameFor(room.current_player_id ?? "")}
                </div>
                <p className="mt-2 text-sm font-black uppercase sm:text-base">
                  Está decidindo a próxima jogada
                </p>
                <div
                  className={`mx-auto mt-4 inline-flex min-w-24 items-center justify-center border-[3px] border-[var(--pop-ink)] px-4 py-2 font-display text-2xl font-black shadow-[4px_4px_0_var(--pop-ink)] ${
                    secondsLeft <= 5
                      ? "bg-[var(--pop-danger)] text-white"
                      : "bg-[var(--pop-warning)] text-[var(--pop-ink)]"
                  }`}
                  aria-live="polite"
                  aria-label={`${secondsLeft} segundos restantes`}
                >
                  {secondsLeft}s
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Reveal picker */}
        {pending?.phase === "lose_influence" && pending.loseInfluence?.playerId === myPlayerId && (
          <div className="hidden">
            <div className="font-display text-lg mb-1">Perca uma influência</div>
            <p className="text-xs opacity-70 mb-3">
              Escolha qual carta revelar — ela sai do jogo permanentemente.
            </p>
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
      </section>

      {showTablePending ? (
        <ActionDock
          players={players}
          myPlayerId={myPlayerId}
          currentPlayerId={room.current_player_id}
          pending={pending}
          myCoins={me?.coins ?? 0}
          myHand={myHand}
          onAction={doAction}
          handOnly
          concealed={isShuffling}
        />
      ) : (
        <ActionDock
          players={players}
          myPlayerId={myPlayerId}
          currentPlayerId={room.current_player_id}
          pending={pending}
          myCoins={me?.coins ?? 0}
          myHand={myHand}
          onAction={doAction}
          concealed={isShuffling}
        />
      )}

      <EventLog events={events} nameFor={nameFor} />

      {error && (
        <div
          role="alert"
          className="fixed top-20 left-1/2 -translate-x-1/2 bg-[var(--pop-danger)] text-white border-3 border-[var(--pop-ink)] shadow-[4px_4px_0_var(--pop-ink)] px-4 py-2 text-sm font-bold z-40 anim-fade-up"
        >
          {error}
        </div>
      )}

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </main>
  );
}

function ExitRoomLink() {
  return (
    <Link
      to="/"
      aria-label="Sair da sala"
      className="group inline-flex min-h-11 items-center gap-2 border-[3px] border-[var(--pop-ink)] bg-[var(--pop-panel)] px-3 py-2 font-display text-sm font-black uppercase text-[var(--pop-ink)] shadow-[3px_3px_0_var(--pop-ink)] transition-[transform,box-shadow,background-color,color] duration-100 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-[var(--pop-danger)] hover:text-white hover:shadow-[5px_5px_0_var(--pop-ink)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_var(--pop-ink)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--pop-focus,#3478f6)] motion-reduce:transition-none"
    >
      <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-[var(--pop-ink)] bg-[var(--pop-danger)] font-sans text-base leading-none text-white transition-colors group-hover:bg-[var(--pop-warning)] group-hover:text-[var(--pop-ink)]">
        ←
      </span>
      <span>Sair</span>
    </Link>
  );
}

function TurnCarousel({
  players,
  currentPlayerId,
}: {
  players: PlayerRow[];
  currentPlayerId: string | null;
}) {
  const orderedPlayers = useMemo(() => {
    const alive = players.filter((player) => player.is_alive).sort((a, b) => a.seat - b.seat);
    if (alive.length < 2) return alive;
    const currentIndex = Math.max(
      0,
      alive.findIndex((player) => player.id === currentPlayerId),
    );
    const previousIndex = (currentIndex - 1 + alive.length) % alive.length;
    return Array.from(
      { length: alive.length },
      (_, offset) => alive[(previousIndex + offset) % alive.length],
    );
  }, [currentPlayerId, players]);
  const carouselPlayers =
    orderedPlayers.length > 1 ? [...orderedPlayers, orderedPlayers[0]] : orderedPlayers;

  return (
    <section aria-labelledby="turn-order-title" className="game-turn-carousel mt-3 shrink-0">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <span className="pop-kicker -rotate-1 text-xs">Ordem da rodada</span>
          <h2
            id="turn-order-title"
            className="mt-2 font-display text-2xl font-black uppercase sm:text-3xl"
          >
            Quem joga agora?
          </h2>
        </div>
        <span className="hidden font-display text-sm font-black uppercase sm:block">Deslize →</span>
      </div>

      <div className="overflow-hidden border-[3px] border-[var(--pop-ink)] bg-[var(--pop-panel)] p-2 shadow-[5px_5px_0_var(--pop-ink)]">
        <div className="flex snap-x items-stretch gap-2 overflow-x-auto px-1 pb-2 pt-2">
          {carouselPlayers.map((player, index) => {
            const isCurrent = player.id === currentPlayerId;
            const restartsCycle =
              index === carouselPlayers.length - 1 && carouselPlayers.length > 1;
            const label = restartsCycle
              ? "Recomeça"
              : index === 0
                ? "Jogou antes"
                : isCurrent
                  ? "Agora"
                  : index === 2
                    ? "Próximo"
                    : `Depois +${index - 1}`;
            return (
              <div
                key={`${player.id}-${index}`}
                className={`relative flex min-h-20 w-44 shrink-0 snap-center items-center gap-2 border-[3px] border-[var(--pop-ink)] px-3 py-2 shadow-[3px_3px_0_var(--pop-ink)] transition-transform lg:min-w-44 lg:flex-1 ${
                  isCurrent
                    ? "-translate-y-2 bg-[var(--pop-warning)] ring-4 ring-[var(--pop-danger)] ring-offset-2"
                    : index === 0
                      ? "bg-[var(--pop-muted)] opacity-75"
                      : restartsCycle
                        ? "bg-[var(--pop-info)] text-white"
                        : "bg-[var(--pop-white)]"
                }`}
              >
                <div
                  aria-hidden="true"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-[3px] border-[var(--pop-ink)] bg-[var(--pop-info)] font-display text-sm font-black text-white"
                >
                  {player.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <span
                    className={`text-xs font-black uppercase ${isCurrent ? "text-[var(--pop-danger)]" : "opacity-60"}`}
                  >
                    {label}
                  </span>
                  <div className="truncate font-display text-base font-black uppercase">
                    {player.name}
                  </div>
                </div>
                {index < carouselPlayers.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-4 z-10 font-display text-2xl font-black"
                  >
                    ›
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ExchangePicker({
  myHand,
  drawn,
  handSize,
  onSubmit,
  embedded = false,
}: {
  myHand: Character[];
  drawn: Character[];
  handSize: number;
  onSubmit: (keep: Character[]) => void;
  embedded?: boolean;
}) {
  const pool = [...myHand, ...drawn];
  const [selected, setSelected] = useState<number[]>([]);
  const toggle = (i: number) => {
    setSelected((s) =>
      s.includes(i) ? s.filter((x) => x !== i) : s.length < handSize ? [...s, i] : s,
    );
  };
  return (
    <div
      className={`${embedded ? "mx-auto w-full max-w-3xl text-center text-white" : "pop-panel mx-auto mt-6 max-w-xl p-4"} anim-fade-up`}
    >
      {embedded && <span className="pop-kicker inline-block text-xs">Ação na mesa</span>}
      <div
        className={`${embedded ? "mt-4 text-3xl [text-shadow:3px_3px_0_var(--pop-ink)] sm:text-5xl" : "mb-1 text-lg"} font-display uppercase`}
      >
        Trocar cartas
      </div>
      <p className={`${embedded ? "mt-2 text-sm font-bold" : "mb-3 text-xs opacity-70"}`}>
        Escolha {handSize} carta{handSize > 1 ? "s" : ""} para manter. As demais voltam ao baralho.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {pool.map((c, i) => (
          <button
            key={i}
            onClick={() => toggle(i)}
            className={`transition-transform ${selected.includes(i) ? "scale-105 ring-4 ring-[var(--pop-warning)] ring-offset-2 ring-offset-[var(--pop-info)]" : "opacity-70 hover:opacity-100"}`}
          >
            <InfluenceCard character={c} size="md" />
          </button>
        ))}
      </div>
      <button
        disabled={selected.length !== handSize}
        onClick={() => onSubmit(selected.map((i) => pool[i]))}
        className={`${embedded ? "mx-auto max-w-sm" : "w-full"} btn-primary mt-5 rounded-md px-6 py-2 text-sm font-semibold`}
      >
        Confirmar
      </button>
    </div>
  );
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4 bg-black/70" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-title"
        className="max-w-4xl w-full pop-panel p-5 sm:p-7 max-h-[90vh] overflow-y-auto anim-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="rules-title" className="font-display text-2xl font-black">
            A corte e suas máscaras
          </h2>
          <button
            onClick={onClose}
            aria-label="Fechar regras"
            className="btn-ghost min-h-11 min-w-11 text-lg"
          >
            ×
          </button>
        </div>
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CHARACTERS.map((c) => (
            <div
              key={c}
              className="flex items-center gap-4 border-[3px] border-[var(--pop-ink)] bg-[var(--pop-white)] p-3 shadow-[4px_4px_0_var(--pop-ink)]"
            >
              <InfluenceCard character={c} size="md" />
              <div>
                <div className="font-display text-lg font-black uppercase">
                  {CHARACTER_META[c].name}
                </div>
                {CHARACTER_META[c].action && (
                  <div className="text-xs">Ação: {CHARACTER_META[c].action}</div>
                )}
                {CHARACTER_META[c].blocks && (
                  <div className="text-xs">Bloqueia: {CHARACTER_META[c].blocks}</div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="text-sm space-y-2 text-[oklch(0.25_0.05_30)]">
          <p>
            <b>Renda:</b> +1 moeda. Nunca bloqueável nem desafiável.
          </p>
          <p>
            <b>Ajuda Externa:</b> +2 moedas. Pode ser bloqueada por Duque.
          </p>
          <p>
            <b>Golpe:</b> paga 7 moedas, alvo perde 1 influência. Obrigatório com 10+ moedas.
          </p>
          <p>
            <b>Desafio:</b> qualquer ação/bloqueio ligado a um personagem pode ser contestado. Quem
            estiver blefando perde 1 influência e a ação falha; se realmente tem a carta, quem
            desafiou perde 1, o autor troca a carta pelo baralho e a ação continua normalmente.
          </p>
          <p>
            <b>Extorsão:</b> o Capitão toma até 2 moedas do alvo. Depois de um desafio perdido
            contra o Capitão, o alvo ainda pode bloquear com Capitão ou Embaixador, desde que
            continue vivo.
          </p>
          <p>Você é eliminado ao perder suas 2 influências. Vence quem sobrar.</p>
        </div>
      </div>
    </div>
  );
}

function VictoryScene({
  winnerName,
  isHost,
  restarting,
  onRestart,
}: {
  winnerName: string;
  isHost: boolean;
  restarting: boolean;
  onRestart: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/80 backdrop-blur">
      <div className="text-center anim-fade-up">
        <div className="wax-seal w-32 h-32 mx-auto rounded-full grid place-items-center font-display text-6xl">
          👑
        </div>
        <div className="mt-6 font-display text-5xl font-black text-[var(--brass)]">
          {winnerName}
        </div>
        <div className="mt-2 text-sm opacity-80">venceu a corte</div>
        {isHost ? (
          <button
            type="button"
            onClick={onRestart}
            disabled={restarting}
            className="btn-primary mt-6 rounded-md px-6 py-3 text-sm font-semibold disabled:opacity-60"
          >
            {restarting ? "Preparando nova rodada..." : "Jogar novamente"}
          </button>
        ) : (
          <p className="mt-6 font-bold text-white">Aguardando o host jogar novamente...</p>
        )}
        <div>
          <Link
            to="/"
            className="btn-ghost mt-4 inline-block px-4 py-2 text-sm font-bold text-[var(--pop-ink)]"
          >
            Sair da sala
          </Link>
        </div>
      </div>
    </div>
  );
}
