import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { join } from "node:path"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": join(import.meta.dirname, "src"),
    },
  },
  server: {
    // webrun must override this, otherwise a real browser opens during tests
    open: true,
    port: 5199,
  },
})
