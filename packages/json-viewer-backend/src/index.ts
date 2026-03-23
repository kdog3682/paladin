// @paladin/json-viewer-backend/src/index.ts

import { Hono } from "hono"
import { cors } from "hono/cors"
import { scanJsonFiles } from "./scanner"

const app = new Hono()

app.use("*", cors())

app.get("/files", async (c) => {
  const files = await scanJsonFiles()
  return c.json(files)
})

app.get("/json", async (c) => {
  const filePath = c.req.query("file")

  if (!filePath) {
    return c.json({ error: "file query param required" }, 400)
  }

  const file = Bun.file(filePath)
  const exists = await file.exists()

  if (!exists) {
    return c.json({ error: "file not found" }, 404)
  }

  const text = await file.text()
  const parsed = JSON.parse(text)

  return c.json({ file: filePath, data: parsed })
})

export default {
  port: 4888,
  fetch: app.fetch,
}
