// @paladin/project-viewer-backend/src/routes/presets.ts
import { Hono } from "hono"
import {
  listPresets,
  getPreset,
  savePreset,
  deletePreset,
  type Preset,
} from "../lib/storage"

export const presets = new Hono()

// GET /presets
presets.get("/", async (c) => {
  const all = await listPresets()
  return c.json(all)
})

// GET /presets/:id
presets.get("/:id", async (c) => {
  const id = c.req.param("id")
  const preset = await getPreset(id)
  if (!preset) return c.json({ error: "not found" }, 404)
  return c.json(preset)
})

// POST /presets
presets.post("/", async (c) => {
  const body = await c.req.json<Preset>()
  if (!body.id) {
    body.id = crypto.randomUUID()
  }
  await savePreset(body)
  return c.json(body)
})

// DELETE /presets/:id
presets.delete("/:id", async (c) => {
  const id = c.req.param("id")
  await deletePreset(id)
  return c.json({ ok: true })
})
