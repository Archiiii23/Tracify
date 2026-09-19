import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ command }) => ({
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    viteReact(),
    // Vercel builds want its own output layout; every other target (including
    // the Lovable platform build) expects the Worker bundle in `dist/`.
    command === "build"
      ? nitro(
          process.env['VERCEL']
            ? { defaultPreset: "vercel", noExternals: true }
            : {
                defaultPreset: "cloudflare_module",
                noExternals: true,
                output: { dir: "dist" },
              },
        )
      : null,
  ],
}));
