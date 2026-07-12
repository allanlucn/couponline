# Multiplayer alpha deploy checklist

Este checklist acompanha o FDD de hardening. Nunca use um projeto de producao para a suite de integracao.

## Gate automatizado

1. Instale Bun e Supabase CLI.
2. Execute `bun install`.
3. Execute `bun run check` (lint, tipos, testes unitarios e build).
4. Inicie o banco descartavel com `bunx supabase start` e aplique as migrations com `bunx supabase db reset`.
5. Habilite anonymous sign-ins no ambiente local e exporte as credenciais exibidas por `bunx supabase status`:

   ```powershell
   $env:SUPABASE_TEST_URL = "http://127.0.0.1:54321"
   $env:SUPABASE_TEST_PUBLISHABLE_KEY = "<anon-or-publishable-key-local>"
   bun run test:integration
   ```

Sem essas duas variaveis, a suite de integracao e marcada como ignorada. CI/deploy deve considerar isso um pre-requisito e fornecer as variaveis.

## Antes do deploy

- Confirme backup/export dos dados alpha e ausencia de duplicatas em `(room_id, anon_user_id)` e `(room_id, seq)`.
- Confirme que `SUPABASE_SERVICE_ROLE_KEY` existe apenas no servidor e nenhuma variavel `VITE_*` contem segredo.
- Confirme que `game_states` nao esta em `supabase_realtime` e nao possui grants/policies para `anon` ou `authenticated`.
- Confirme que `hands` continua limitada ao `auth.uid()` dono e que `rooms.state` foi sanitizado nos registros antigos.
- Execute manualmente uma partida completa com troca; inspecione REST, Realtime, HTML SSR e bundle para `deck`, `rngSeed`, `exchangeCards` e cartas alheias.
- Rode os cenarios concorrentes do FDD em banco local: joins 8x, start 2x, timeout 10x, pass/desafio e tres salas paralelas.

## Rollout

1. Aplique primeiro a migration aditiva.
2. Publique o servidor que grava estado canonico e snapshot publico sanitizado.
3. Complete uma sala de teste e valide versao, eventos, jogadores e maos.
4. Remova fallbacks antigos somente depois da validacao.

## Rollback e operacao

- Prefira roll-forward se o codigo anterior voltar a expor estado secreto.
- Nao apague `game_states` durante rollback.
- Defina uma janela de retencao e limpe apenas salas finalizadas/abandonadas; nunca uma partida ativa.
- Logs podem conter `roomId`, tipo da acao, jogador, versao, resultado e duracao. Nao registre JWT, cartas, deck, estado canonico ou service role.

## Cobertura ainda dependente do banco

O smoke test automatiza bloqueio de `game_states` e ausencia de chaves secretas em `rooms.state`. Isolamento entre maos, Realtime, concorrencia de RPC, multissala e contagem de canais exigem fixtures autenticadas e as RPCs finais; permanecem gates obrigatorios antes da alpha.
