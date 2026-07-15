import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createRoom, joinRoom } from "@/lib/coup.functions";
import { useAnonSession } from "@/lib/anon-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Coup Online — O blefe começa aqui" },
      { name: "description", content: "Jogo online de blefe e estratégia para 2 a 6 jogadores." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const uid = useAnonSession();
  const create = useServerFn(createRoom);
  const join = useServerFn(joinRoom);
  const [mode, setMode] = useState<"create" | "join" | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionTimeoutSeconds, setActionTimeoutSeconds] = useState(20);

  function chooseMode(nextMode: "create" | "join") {
    setMode(nextMode);
    setErr(null);
  }

  async function handleCreate() {
    if (!name.trim()) return setErr("Digite um nome de exibição");
    setBusy(true);
    setErr(null);
    try {
      const res = await create({ data: { name: name.trim(), actionTimeoutSeconds } });
      sessionStorage.setItem(`coup:player:${res.code}`, res.playerId);
      navigate({ to: "/room/$code", params: { code: res.code } });
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Não foi possível criar a sala");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (!name.trim()) return setErr("Digite um nome de exibição");
    if (code.trim().length < 4) return setErr("Digite o código da sala");
    setBusy(true);
    setErr(null);
    try {
      const normalizedCode = code.trim().toUpperCase();
      const res = await join({
        data: { name: name.trim(), code: normalizedCode },
      });
      sessionStorage.setItem(`coup:player:${res.code}`, res.playerId);
      navigate({ to: "/room/$code", params: { code: res.code } });
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Não foi possível entrar na sala");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pop-shell flex min-h-screen flex-col overflow-hidden px-4 py-8 sm:py-12">
      <div className="pointer-events-none absolute -left-16 top-16 h-40 w-40 rounded-full bg-[var(--pop-warning)] pop-halftone" />
      <div className="pointer-events-none absolute -right-20 bottom-8 h-56 w-56 rotate-12 bg-[var(--pop-danger)] pop-halftone [clip-path:polygon(50%_0,61%_34%,98%_20%,70%_50%,100%_72%,62%_67%,50%_100%,38%_67%,0_72%,30%_50%,2%_20%,39%_34%)]" />
      <div className="relative mx-auto grid w-full max-w-5xl flex-1 items-center gap-8 lg:grid-cols-[1.05fr_.95fr]">
        <section className="text-center lg:text-left">
          <span className="pop-kicker inline-block -rotate-2">Blefe • Desafie • Domine</span>
          <h1 className="mt-5 font-display text-6xl font-black uppercase leading-[.82] sm:text-7xl lg:text-8xl">
            Coup
            <span className="block text-[var(--pop-danger)] [text-shadow:4px_4px_0_var(--pop-ink)]">
              Online!
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-lg text-base font-semibold leading-relaxed lg:mx-0 lg:text-lg">
            Máscaras, moedas e mentiras em uma disputa rápida para 2 a 6 jogadores.
          </p>
          <div
            className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start"
            aria-label="Destaques"
          >
            <span className="pop-badge">2–6 jogadores</span>
            <span className="pop-badge pop-badge--yellow">Partidas rápidas</span>
            <span className="pop-badge pop-badge--blue">Grátis</span>
          </div>
        </section>

        <section className="pop-panel relative p-5 sm:p-7" aria-labelledby="play-title">
          <div className="absolute -right-3 -top-4 rotate-3 border-3 border-[var(--pop-ink)] bg-[var(--pop-warning)] px-3 py-1 font-display text-sm font-black uppercase">
            Jogue agora!
          </div>
          <h2 id="play-title" className="font-display text-3xl font-black uppercase">
            Entre na disputa
          </h2>
          <p className="mt-1 text-sm font-medium opacity-70">
            {mode ? "Complete os dados para continuar." : "O que você quer fazer?"}
          </p>

          {!mode ? (
            <div className="mt-6 grid gap-4">
              <button
                type="button"
                onClick={() => chooseMode("create")}
                className="btn-primary min-h-16 w-full px-5 py-4 font-display text-xl font-black uppercase"
              >
                Criar uma sala
              </button>
              <button
                type="button"
                onClick={() => chooseMode("join")}
                className="btn-danger min-h-16 w-full px-5 py-4 font-display text-xl font-black uppercase"
              >
                Entrar em uma sala
              </button>
            </div>
          ) : (
            <div className="mt-5 anim-fade-up">
              <button
                type="button"
                onClick={() => setMode(null)}
                className="btn-ghost mb-5 px-4 py-2 text-sm font-black uppercase"
              >
                ← Voltar
              </button>
              <div className="pop-kicker mb-4 text-sm">
                {mode === "create" ? "Nova sala" : "Entrar com código"}
              </div>

              <label
                className="block text-xs font-black uppercase tracking-wider"
                htmlFor="player-name"
              >
                Seu codinome
              </label>
              <input
                id="player-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={24}
                placeholder="Ex.: Raposa Escarlate"
                className="pop-input mt-2"
                autoComplete="nickname"
                autoFocus
              />

              {mode === "create" ? (
                <>
                  <div className="mt-5">
                    <label
                      htmlFor="turn-time"
                      className="flex items-center justify-between text-xs font-black uppercase tracking-wider"
                    >
                      <span>Tempo por ação</span>
                      <strong className="pop-badge pop-badge--blue">{actionTimeoutSeconds}s</strong>
                    </label>
                    <input
                      id="turn-time"
                      type="range"
                      min={20}
                      max={60}
                      step={5}
                      value={actionTimeoutSeconds}
                      onChange={(event) => setActionTimeoutSeconds(Number(event.target.value))}
                      className="mt-3 h-3 w-full accent-[var(--pop-danger)]"
                    />
                    <p className="mt-2 text-xs font-bold opacity-65">
                      Configuração exclusiva do host; ela ainda pode ser alterada no lobby.
                    </p>
                  </div>
                  <button
                    onClick={handleCreate}
                    disabled={busy || !uid}
                    className="btn-primary mt-6 min-h-14 w-full px-5 py-3 font-black uppercase"
                  >
                    {busy ? "Preparando..." : "Confirmar e criar sala"}
                  </button>
                </>
              ) : (
                <>
                  <label
                    className="mt-5 block text-xs font-black uppercase tracking-wider"
                    htmlFor="room-code"
                  >
                    Código da sala
                  </label>
                  <input
                    id="room-code"
                    value={code}
                    onChange={(event) =>
                      setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                    }
                    maxLength={8}
                    placeholder="CÓDIGO"
                    className="pop-input mt-2 text-center font-mono text-lg uppercase tracking-[.25em]"
                  />
                  <button
                    onClick={handleJoin}
                    disabled={busy || !uid}
                    className="btn-danger mt-6 min-h-14 w-full px-6 py-3 font-black uppercase"
                  >
                    {busy ? "Entrando..." : "Entrar na sala"}
                  </button>
                </>
              )}
            </div>
          )}

          {err && (
            <div
              role="alert"
              className="mt-4 border-3 border-[var(--pop-ink)] bg-[var(--pop-danger)] px-3 py-2 text-sm font-bold text-white"
            >
              {err}
            </div>
          )}
        </section>
      </div>

      <footer className="relative mx-auto mt-8 w-full max-w-5xl text-center text-sm font-bold uppercase tracking-wide sm:mt-10">
        <span className="opacity-60">Feito por </span>
        <a
          href="https://github.com/allanlucn"
          target="_blank"
          rel="noreferrer"
          className="font-display text-[var(--pop-info)] underline decoration-2 underline-offset-4 transition-colors hover:text-[var(--pop-danger)] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[var(--pop-focus,#3478f6)]"
        >
          Allan Lucena
        </a>
      </footer>
    </main>
  );
}
