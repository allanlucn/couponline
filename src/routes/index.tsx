import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createRoom, joinRoom } from "@/lib/coup.functions";
import { useAnonSession } from "@/lib/anon-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Coup Online — Corte de Blefes" },
      { name: "description", content: "Jogo online de blefe e traição inspirado em Coup. Crie uma sala e jogue com amigos direto do navegador — sem contas." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const uid = useAnonSession();
  const create = useServerFn(createRoom);
  const join = useServerFn(joinRoom);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return setErr("Digite um nome de exibição");
    setBusy(true); setErr(null);
    try {
      const res = await create({ data: { name: name.trim() } });
      sessionStorage.setItem(`coup:player:${res.code}`, res.playerId);
      navigate({ to: "/room/$code", params: { code: res.code } });
    } catch (e: any) { setErr(e.message ?? "Erro"); }
    finally { setBusy(false); }
  }
  async function handleJoin() {
    if (!name.trim()) return setErr("Digite um nome");
    if (code.trim().length < 4) return setErr("Digite o código da sala");
    setBusy(true); setErr(null);
    try {
      const res = await join({ data: { name: name.trim(), code: code.trim().toUpperCase() } });
      sessionStorage.setItem(`coup:player:${res.code}`, res.playerId);
      navigate({ to: "/room/$code", params: { code: res.code } });
    } catch (e: any) { setErr(e.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen grid place-items-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="wax-seal w-14 h-14 rounded-full grid place-items-center font-display font-black text-2xl">C</div>
          </div>
          <h1 className="font-display text-5xl sm:text-6xl font-black leading-none">
            Corte de <span className="text-[var(--brass)] italic">Blefes</span>
          </h1>
          <p className="mt-3 text-muted-foreground text-sm sm:text-base max-w-md mx-auto">
            Um duelo de máscaras e mentiras entre 2 e 6 nobres. Nenhuma conta. Nenhuma senha. Só a sua palavra — e o quanto ela vale.
          </p>
        </div>

        <div className="parchment rounded-lg p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-1 text-[oklch(0.35_0.1_25)]">Seu nome na corte</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder="Ex.: Vespasiano"
              className="w-full rounded-md border border-[oklch(0.5_0.08_40)]/40 bg-[oklch(0.95_0.02_75)] px-3 py-2 text-[oklch(0.2_0.05_30)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--bordeaux)]"
            />
          </div>

          <div className="grid gap-2">
            <button onClick={handleCreate} disabled={busy || !uid} className="btn-primary w-full rounded-md py-2.5 text-sm font-semibold">
              Fundar uma nova sala
            </button>
            <div className="text-center text-xs text-[oklch(0.35_0.08_30)]/70 my-1">ou</div>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                maxLength={8}
                placeholder="CÓDIGO"
                className="w-full rounded-md border border-[oklch(0.5_0.08_40)]/40 bg-[oklch(0.95_0.02_75)] px-3 py-2 text-[oklch(0.2_0.05_30)] font-mono tracking-widest text-center uppercase focus:outline-none focus:ring-2 focus:ring-[var(--bordeaux)]"
              />
              <button onClick={handleJoin} disabled={busy || !uid} className="btn-danger rounded-md px-4 py-2 text-sm font-semibold whitespace-nowrap">
                Entrar
              </button>
            </div>
          </div>

          {err && <div className="text-sm text-[var(--bordeaux)] font-medium">{err}</div>}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Baseado nas regras de Coup (Rikki Tahta). Arte e código originais.
        </p>
      </div>
    </main>
  );
}
