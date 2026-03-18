// @paladin/project-viewer-backend/src/index.ts
import { Hono } from "hono"
import { cors } from "hono/cors"
import { repo } from "./routes/repo"
import { sessions } from "./routes/sessions"
import { presets } from "./routes/presets"

const app = new Hono()

app.use("*", cors())
app.route("/repo", repo)
app.route("/sessions", sessions)
app.route("/presets", presets)

export default {
  port: 4800,
  fetch: app.fetch,
}
