import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  plugins: [
    {
      name: "courtly-coup-dev-logger",
      apply: "serve",
      configureServer(server) {
        server.httpServer?.once("listening", () => {
          console.log("\n  Coup Online pronto em http://127.0.0.1:5173\n");
        });
      },
    },
    tanstackStart({ server: { entry: "server" } }),
    nitro({ preset: "vercel" }),
    viteReact(),
    tailwindcss(),
  ],
});
