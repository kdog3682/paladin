// @paladin/scribe-api/src/index.ts

import { Hono } from "hono"
import { cors } from "hono/cors"
import { nanoid } from "nanoid"
import { db, schema } from "./db"
import { eq } from "drizzle-orm"
import { appState } from "./state"
import tickets from "./routes/tickets"
import templates from "./routes/templates"
import fileGroups from "./routes/file-groups"
import files from "./routes/files"
import config from "./routes/config"
import state from "./routes/state"

async function seed() {
  appState.projectDir = process.cwd()

  // seed global filters singleton if missing
  const existing = await db.query.globalFilters.findFirst({
    where: eq(schema.globalFilters.id, "singleton"),
  })
  if (!existing) {
    await db.insert(schema.globalFilters).values({
      id: "singleton",
      include: "\\.tsx?$|\\.py$|\\.rs$|\\.go$|\\.lua$|\\.sh$",
      exclude: "node_modules|dist|build|\\.config\\.|package\\.json|tsconfig|\\.lock$|\\.ico$|\\.png$|\\.jpg$|\\.svg$",
    })
  }

  // seed default source dir if none exist
  const dirs = await db.select().from(schema.sourceDirs).all()
  if (dirs.length === 0) {
    await db.insert(schema.sourceDirs).values({
      id: nanoid(),
      path: appState.projectDir,
      include: null,
      exclude: null,
      visible: true,
    })
  }

  console.log(`[scribe] seeded — projectDir: ${appState.projectDir}`)
}

const app = new Hono()

app.use("*", cors())

app.route("/tickets", tickets)
app.route("/templates", templates)
app.route("/file-groups", fileGroups)
app.route("/files", files)
app.route("/config", config)
app.route("/state", state)

await seed()

console.log("[scribe] listening on :4800")

export default {
  port: 4800,
  fetch: app.fetch,
}
