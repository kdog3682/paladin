// @paladin/scribe-api/src/routes/state.ts

import { Hono } from "hono"
import { appState } from "../state"

const app = new Hono()

app.get("/project-dir", (c) => {
  return c.json({ projectDir: appState.projectDir })
})

app.get("/recent-files", (c) => {
  return c.json({ recentFiles: appState.recentFiles })
})

app.put("/project-dir", async (c) => {
  const { projectDir } = await c.req.json()
  if (!projectDir) return c.json({ error: "projectDir is required" }, 400)
  appState.projectDir = projectDir
  return c.json({ projectDir: appState.projectDir })
})

app.put("/recent-files", async (c) => {
  const { recentFiles } = await c.req.json()
  if (!Array.isArray(recentFiles)) return c.json({ error: "recentFiles must be an array" }, 400)
  appState.recentFiles = recentFiles
  return c.json({ recentFiles: appState.recentFiles })
})

export default app
