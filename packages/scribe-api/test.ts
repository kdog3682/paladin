// @paladin/scribe-api/test.ts

import { Database } from "bun:sqlite"

const BASE = "http://localhost:4800"

// check db tables directly
function checkDb() {
  const sqlite = new Database("scribe.db")
  const tables = sqlite
    .query("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as { name: string }[]
  console.log("[db] tables:", tables.map((t) => t.name))
  sqlite.close()
}

async function get(path: string) {
  try {
    const res = await fetch(`${BASE}${path}`)
    const data = await res.json()
    console.log(`[GET ${path}]`, res.status, JSON.stringify(data).slice(0, 200))
  } catch (e) {
    console.error(`[GET ${path}] FAILED:`, e.message)
  }
}

checkDb()
await get("/tickets")
await get("/config/source-dirs")
await get("/config/global-filters")
await get("/state/project-dir")
