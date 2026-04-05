import { Hono } from "hono"
import { cors } from "hono/cors"
import { filewatchRoute, websocket } from "./routes/filewatch"

const app = new Hono()

app.use("*", cors())
app.route("/", filewatchRoute)

app.get("/health", (c) => c.json({ ok: true }))

export default {
  port: 4801,
  fetch: app.fetch,
  websocket,
}
