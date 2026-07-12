# Coup Online — Plano de Construção

## Visão geral
Reconstruir o jogo do zero num app **TanStack Start (React + TS)** já configurado no template, com **Tailwind v4** para o design system, **Lovable Cloud (Supabase)** para persistência + Realtime, e **sessão anônima** para nunca mostrar tela de login. Deploy final compatível com Vercel/Lovable.

> Nota de stack: o template atual é TanStack Start, não Vite puro / Next. É o equivalente funcional (React + TS + serverless), roda no mesmo modelo de deploy e atende o requisito de "sem servidor WebSocket próprio". Aviso antes de começar caso você prefira migrar para Next.

---

## Fase 1 — Modelo de dados

**Tabelas (Postgres, schema `public`):**

- `rooms`
  - `id uuid pk`, `code text unique` (6 chars A–Z/2–9, sem ambíguos)
  - `status`: `lobby | playing | finished`
  - `host_id uuid` (referencia `players.id`)
  - `turn_index int`, `current_player_id uuid`
  - `deck jsonb` (array de cartas restantes)
  - `pending_action jsonb` (ação em resolução: tipo, autor, alvo, janela de desafio/bloqueio, timestamps)
  - `winner_id uuid null`, `created_at`, `updated_at`
- `players`
  - `id uuid pk`, `room_id fk`, `anon_user_id uuid` (do `auth.users` anônimo)
  - `name text`, `seat int`, `coins int`, `is_host bool`, `is_alive bool`
  - `hand jsonb` (2 cartas: `{character, revealed}`)
  - `connected bool`, `joined_at`
- `events`
  - `id`, `room_id fk`, `seq int`, `type`, `payload jsonb`, `created_at` — log append-only

**RLS:** sessão anônima obrigatória. Qualquer um pode ler linhas de uma sala se conhecer o `code` (via RPC `join_room(code, name)` que retorna o `player_id`). Escrita restrita ao próprio `anon_user_id`. O `hand` de outros jogadores não vaza: view `players_public` que omite `hand` para todos exceto o dono; o próprio jogador lê a mão via view `my_hand`.

**Mutações críticas via RPC (SECURITY DEFINER)** para garantir integridade das regras: `start_game`, `perform_action`, `challenge`, `block`, `resolve_reveal`, `exchange_return`, `lose_influence`. O motor de regras roda no servidor (Postgres function chamando lógica JS via edge? — não: implementamos a validação em JS num server function do TanStack Start que usa `supabaseAdmin` e valida turno/estado antes de escrever). Cliente nunca escreve estado direto.

---

## Fase 2 — Motor de regras (puro, testável)

Módulo `src/game/engine.ts` — funções puras `(state, action) => newState | error`:

- `applyIncome`, `applyForeignAid`, `applyCoup`, `applyTax`, `applyAssassinate`, `applySteal`, `applyExchange`
- `startChallenge(state, challenger, target)` → resolve reveal (tem carta? troca no baralho; senão perde influência)
- `startBlock(state, blocker, claimedChar)` → abre nova janela de desafio ao bloqueio
- `loseInfluence(state, player, cardIndex)`
- `advanceTurn(state)` — pula eliminados, aplica regra dos 10+ moedas (obriga Coup)
- Casos de borda: múltiplos desafiadores (primeiro válido vence), reposição pós-reveal bem-sucedido, alvo de assassinato sem moedas suficientes do autor bloqueia ação, Extorquir de quem tem 0/1 moeda pega o que tiver.

Testes unitários com Vitest cobrindo cada personagem + fluxos de desafio/bloqueio + vitória.

---

## Fase 3 — Componentes e telas

**Rotas** (`src/routes/`):
- `index.tsx` — landing com "Criar sala" / "Entrar com código" + input de nome
- `room.$code.tsx` — engloba lobby E mesa (troca por `room.status`)

**Componentes principais:**
- `<Table />` — mesa oval central em CSS grid responsivo (não `position:absolute` fixado): jogadores em `grid-template-areas` que colapsam para lista vertical < 640px
- `<PlayerSeat />` — avatar procedural (SVG monograma + brasão), moedas, chips de influência (2 cartas viradas), estado (turno atual, morto, blefando)
- `<InfluenceCard />` — carta de pergaminho com **selo de cera** que quebra + flip 3D via CSS `transform: rotateY` + `prefers-reduced-motion`
- `<ActionDock />` — barra inferior fixa: Renda, Ajuda Externa, Golpe, Taxar, Assassinar, Extorquir, Trocar — cada botão com tooltip da regra, desabilitado quando não faz sentido (ex: Coup obrigatório com 10+)
- `<ChallengeBanner />` — banner central com contagem regressiva ("Alguém contesta?") + botões Desafiar / Bloquear / Passar
- `<EventLog />` — painel lateral direito recolhível, scroll invertido, ícones por tipo de evento
- `<RulesModal />` e `<CheatSheetModal />`
- `<VictoryScene />` — brasão do vencedor, moedas caindo, botão "Nova partida"

**Personagens (arte original):** 5 SVGs autorais — silhuetas heráldicas (Duque = coroa+cetro, Assassino = adaga+capuz, Capitão = âncora+corda, Embaixador = pergaminho selado, Condessa = leque+véu). Nada copiado do jogo físico.

---

## Fase 4 — Tempo real

- Login anônimo via `supabase.auth.signInAnonymously()` no primeiro carregamento (invisível ao usuário).
- `join_room(code, name)` RPC → cria linha em `players`, retorna `player_id` guardado em `sessionStorage`.
- Cliente inscreve em canal Realtime `room:{id}` para `rooms`, `players`, `events`.
- Toda mutação → server function TanStack que valida via engine e escreve com service role.

---

## Fase 5 — Design system

`src/styles.css` (Tailwind v4 `@theme`):
- Cores: `--color-ink #14161C`, `--color-parchment #EDE6D6`, `--color-bordeaux #7A2E43`, `--color-brass #C9A24B`, `--color-moss #4F6B58`, `--color-ivory #F4F1E8` (convertidas para `oklch`)
- Fontes: **Fraunces** (display) + **Manrope** (UI) via `<link>` no `__root.tsx` head. Números `font-variant-numeric: tabular-nums`.
- Tokens de sombra pesada + textura de pergaminho (SVG filter grain), radius sutil (`--radius: 6px`), selo de cera como gradiente radial + `clip-path`.
- Animações: `card-flip`, `coin-fly`, `seal-crack`, `shake-bluff`, `victory-bloom`.

**Antipatrões rejeitados:** nada de creme+terracota+serifada padrão, nada de neon único sobre preto, nada de layout jornal. Assinatura visual = pergaminho envelhecido sobre tinta noturna + selo de cera vermelho como elemento recorrente.

---

## Fase 6 — Critérios de pronto (checklist final)
- [ ] Todas as 5 ações de personagem + 3 ações gerais + desafios + bloqueios corretos
- [ ] Regra dos 10+ moedas força Coup
- [ ] Reposição de carta após reveal bem-sucedido
- [ ] Layout íntegro em 375px (mesa vira coluna, ActionDock rola horizontal)
- [ ] Zero `position: absolute` com pixels fixos sem media query
- [ ] Foco de teclado visível (`:focus-visible` com anel latão)
- [ ] Feedback: turno / desafio / carta perdida / vitória, todos animados
- [ ] `prefers-reduced-motion` respeitado
- [ ] Nenhuma tela de login/cadastro em nenhum fluxo
- [ ] Arte dos 5 personagens original

---

## O que não vou construir sem você pedir
- Chat de sala, ranking global, contas persistentes, replays, som/música, i18n, spectator mode.

---

## Diagrama de fluxo

```text
[Landing] --nome--> [Criar/Entrar]
    |                    |
    +------ code -------+
                |
           [Lobby /room/:code]
                |  host clica "Iniciar"
                v
           [Mesa de Jogo]
             |    ^
             |    | desafios/bloqueios
             v    |
      [ChallengeBanner]
             |
             v
          [Vitória]
```

---

Se aprovar, começo pela **Fase 1 (schema + RLS + sessão anônima)** e **Fase 2 (engine puro + testes)** em paralelo, depois monto o design system e a UI. Posso também confirmar antes: manter TanStack Start (recomendado, já configurado) ou migrar para Next.js?
