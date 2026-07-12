import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-display">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">Esta sala saiu do baralho.</p>
        <Link
          to="/"
          className="btn-primary mt-6 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium"
        >
          Voltar ao salão
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    console.error("Root route error", error);
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-display">Um selo se partiu.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo saiu do combinado. Tente novamente.
        </p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="btn-primary mt-6 rounded-md px-4 py-2 text-sm font-medium"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Coup Online — Corte de Blefes" },
      {
        name: "description",
        content:
          "Jogo online de blefe e traição inspirado em Coup. Crie uma sala e jogue com amigos direto do navegador — sem contas, sem senhas.",
      },
      { property: "og:title", content: "Coup Online — Corte de Blefes" },
      { property: "og:description", content: "Blefe, desafie e sobreviva na corte." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=Manrope:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <div className="relative z-10">
        <Outlet />
      </div>
    </QueryClientProvider>
  );
}
