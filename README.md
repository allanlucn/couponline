<div align="center">

# [Coup Online](https://oncoup.vercel.app/)

**Blefe, desafie e domine a mesa em partidas multiplayer direto do navegador.**

[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![TanStack Start](https://img.shields.io/badge/TanStack_Start-RC-FF4154?logo=reactquery&logoColor=white)](https://tanstack.com/start)
[![Supabase](https://img.shields.io/badge/Supabase-Realtime-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Bun](https://img.shields.io/badge/Bun-1.3+-000000?logo=bun&logoColor=white)](https://bun.sh/)

</div>

## Sobre

Coup Online é uma adaptação web multiplayer do jogo social de blefe e dedução. Cada participante recebe influências secretas, acumula moedas e pode declarar ações de qualquer personagem — dizendo a verdade ou blefando. Os demais jogadores decidem se desafiam, bloqueiam ou deixam a ação seguir.

A interface usa uma identidade pop-art autoral inspirada em quadrinhos impressos, com cartas ilustradas, alto contraste e suporte responsivo para desktop e dispositivos móveis.

## Destaques

- Salas privadas para 2 a 6 jogadores com código compartilhável.
- Multiplayer em tempo real por meio do Supabase Realtime.
- Entrada por convite direto, sem cadastro ou senha.
- Ações, desafios, bloqueios e blefes seguindo o fluxo de Coup.
- Cronômetro configurável entre 20 e 60 segundos pelo host.
- Ação automática de Renda quando o tempo do turno termina.
- Histórico da partida, regras integradas e ordem circular de turnos.
- Interface acessível, responsiva e otimizada para toque.
- Motor de regras determinístico separado da interface e da persistência.

## Tecnologias

| Camada               | Tecnologia                         |
| -------------------- | ---------------------------------- |
| Interface            | React 19, Tailwind CSS 4           |
| Aplicação full-stack | TanStack Start e TanStack Router   |
| Dados e autenticação | Supabase Postgres, Auth e Realtime |
| Validação            | Zod                                |
| Build e runtime      | Vite 8, Nitro e Bun                |
| Qualidade            | TypeScript, ESLint e Prettier      |

## Como jogar

1. Crie uma sala, escolha seu codinome e configure o tempo das ações.
2. Compartilhe o código ou o link da sala com os demais jogadores.
3. Quando houver pelo menos dois participantes, o host inicia a partida.
4. No seu turno, escolha uma ação geral ou alegue possuir um personagem.
5. Outros jogadores podem desafiar alegações; ações elegíveis também podem ser bloqueadas.
6. O último jogador com influência vence.

Cada partida usa três cópias de Duque, Assassino, Capitão, Embaixador e Condessa.

## Executando localmente

### Requisitos

- [Bun](https://bun.sh/) 1.3 ou superior.
- Um projeto [Supabase](https://supabase.com/) com autenticação anônima habilitada.
- Supabase CLI, caso queira aplicar as migrations pelo terminal.

### Instalação

```bash
git clone https://github.com/allanlucn/couponline.git
cd couponline
bun install
```

Copie o arquivo de exemplo e preencha as credenciais:

```bash
cp .env.example .env
```

No PowerShell:

```powershell
Copy-Item .env.example .env
```

> Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` no cliente ou em commits. Apenas variáveis iniciadas por `VITE_` são destinadas ao navegador.

### Banco de dados

As migrations estão em [`supabase/migrations`](supabase/migrations). Para aplicá-las a um projeto vinculado:

```bash
bunx supabase link --project-ref SEU_PROJECT_REF
bunx supabase db push
```

Habilite **Anonymous Sign-Ins** em `Authentication > Providers > Anonymous` no painel do Supabase.

### Desenvolvimento

```bash
bun run dev
```

O servidor fica disponível em [http://127.0.0.1:5173](http://127.0.0.1:5173).

## Comandos

| Comando                    | Descrição                                    |
| -------------------------- | -------------------------------------------- |
| `bun run dev`              | Inicia o servidor de desenvolvimento com HMR |
| `bun run build`            | Gera o build de produção                     |
| `bun run preview`          | Executa uma prévia do build                  |
| `bun run lint`             | Verifica código e formatação                 |
| `bun run typecheck`        | Verifica os tipos TypeScript                 |
| `bun run test`             | Executa os testes unitarios                  |
| `bun run test:integration` | Executa smoke tests contra Supabase local    |
| `bun run check`            | Executa lint, typecheck, testes e build      |
| `bun run format`           | Formata o projeto com Prettier               |

## Estrutura do projeto

```text
src/
├── components/coup/       # Cartas, jogadores, ações e histórico
├── game/                  # Tipos e motor puro das regras
├── hooks/                 # Estado reativo da sala
├── integrations/supabase/ # Clientes, autenticação e tipos do banco
├── lib/                   # Server functions e utilidades da aplicação
├── routes/                # Landing page e sala multiplayer
└── styles.css             # Design system pop-art

supabase/
├── migrations/            # Schema, políticas RLS e Realtime
└── config.toml            # Configuração do projeto Supabase
```

## Arquitetura

O motor em `src/game/engine.ts` é puro e não depende de React ou Supabase. As server functions carregam o estado privado, validam a identidade do jogador, aplicam uma ação no motor e persistem o novo estado. O cliente recebe apenas o estado público da sala e a própria mão, atualizados por canais Realtime.

Essa separação evita que cartas secretas sejam enviadas aos adversários e mantém as regras centralizadas no servidor.

## Contribuindo

1. Crie uma branch a partir de `main`.
2. Faça alterações pequenas e focadas.
3. Execute `bun run check`.
4. Abra um pull request explicando o problema e a solução.

Relatos de bugs e sugestões podem ser enviados pelas [issues do GitHub](https://github.com/allanlucn/courtly-coup-canvas/issues).

## Aviso

Projeto independente, sem associação com a editora ou os detentores da marca Coup. As imagens de personagens usadas nesta aplicação pertencem ao projeto e a implementação não distribui materiais do jogo físico original.

Este repositório ainda não declara uma licença de código aberto. Consulte o autor antes de reutilizar ou redistribuir o código e os assets.
