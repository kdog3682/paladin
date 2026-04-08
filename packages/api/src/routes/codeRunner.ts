// src/routes/codeRunner.ts

import { Hono } from "hono"
import { runSingle, setAutoRun } from "../services/codeRunner"

const app = new Hono()

/**
 * POST /coderunner/run
 * Trigger a one-off run for a file.
 * Body: { file: string }
 */
app.post("/run", async (c) => {
  const { file } = await c.req.json<{ file: string }>()

  if (!file) {
    return c.json({ error: "file is required" }, 400)
  }

  const result = await runSingle(file)

  if (!result) {
    return c.json({ error: "no matching handler for file" }, 404)
  }

  return c.json(result)
})

/**
 * POST /coderunner/autorun
 * Enable or disable auto-run for a file.
 * Body: { file: string, enabled: boolean }
 */
app.post("/autorun", async (c) => {
  const { file, enabled } = await c.req.json<{ file: string, enabled: boolean }>()
  setAutoRun(file, enabled)
  return c.json({ ok: true })
})

export default app
