// src/routes/runcode.ts

import { Hono } from "hono"
import { codeRunner } from "../services/runcode"

const app = new Hono()

app.post("/autorun", async (c) => {
  const { file, enabled } = await c.req.json<{ file: string, enabled: boolean }>()
  if (!file || typeof enabled !== "boolean") {
    return c.json({ error: "file and enabled required" }, 400)
  }
  codeRunner.setAutoRun(file, enabled)
  return c.json({ file, enabled })
})

app.post("/rerun", async (c) => {
  const { file } = await c.req.json<{ file: string }>()
  if (!file) return c.json({ error: "file required" }, 400)

  const result = await codeRunner.rerun(file)
  if (!result) return c.json({ error: "no handler matched" }, 404)

  return c.json(result)
})

export default app
