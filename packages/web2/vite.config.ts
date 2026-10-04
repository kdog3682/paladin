import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { createReadStream, existsSync, statSync } from "node:fs"
import { resolve, join } from "node:path"
import tsconfigPaths from 'vite-tsconfig-paths'

// the manim package is a sibling repo that is not installed here, so it is
// reached by path. its browser barrel (src/browser) currently imports a missing
// ../document/document, so the viewer imports modules from src directly
const MANIM = resolve(__dirname, "../../../mathpen/packages/manim")

// the browser font backend fetches /fonts/metrics/** and the page loads
// /fonts/files/**. those live in the web app next to the manim package, so
// they are served from there rather than copied. a plain middleware, because
// a public dir is not served when webrun generates the shell
const MANIM_FONTS = resolve(__dirname, "../../../mathpen/packages/web/public/fonts")

const manimFonts = (): Plugin => ({
  name: "manim-fonts",
  configureServer(server) {
    server.middlewares.use("/fonts", (req, res, next) => {
      const file = join(MANIM_FONTS, decodeURIComponent((req.url ?? "").split("?")[0]!))
      if (!file.startsWith(MANIM_FONTS) || !existsSync(file) || !statSync(file).isFile()) return next()
      res.setHeader("Content-Type", file.endsWith(".json") ? "application/json" : "font/woff2")
      createReadStream(file).pipe(res)
    })
  },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths(), manimFonts()],
  resolve: {
    alias: [
      { find: "@mathpen/manim/fonts-backend", replacement: `${MANIM}/src/fonts/load.browser.ts` },
      { find: /^@mathpen\/manim\/src/, replacement: `${MANIM}/src` },
    ],
  },
  server: {
    port: 5173,
    fs: { allow: [resolve(__dirname, "../../..")] },

    proxy: {
      "/images": {
        target: "http://localhost:3000",
      },

      "/controller": {
        target: "http://localhost:3000",
      },

      "/api": {
        target: "http://localhost:3000",
      },

      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
      },
    },
  },
})