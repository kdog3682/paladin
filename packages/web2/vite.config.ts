import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  server: {
    port: 5173,

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