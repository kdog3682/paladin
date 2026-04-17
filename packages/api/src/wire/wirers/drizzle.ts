import path from "path"
import { readFileSafe, writeFileSafe } from "../../utils/fs"
import { bash } from "../../utils/bash"
import { isDbFile } from "../paths"
import type { Wirer, WirerResult } from "../types"

const DRIZZLE_IMPORT_RE = /from\s+['"]drizzle-(orm|kit)['"]/

export const drizzleWirer: Wirer = {
  name: "drizzle",
  match: isDbFile,
  async run(paths): Promise<WirerResult> {
    const written: string[] = []
    const pkgRoots = new Set<string>()

    for (const p of paths) {
      const source = await readFileSafe(p)
      if (!source) continue
      if (!DRIZZLE_IMPORT_RE.test(source)) continue
      const { root, writtenFiles } = await ensureDrizzleFor(p)
      pkgRoots.add(root)
      written.push(...writtenFiles)
    }

    for (const root of pkgRoots) {
      await runDrizzlePush(root)
    }

    return { written }
  },
}

async function ensureDrizzleFor(
  dbFilePath: string,
): Promise<{ root: string; writtenFiles: string[] }> {
  const dir = path.dirname(dbFilePath)
  const pkgRoot = findPkgRoot(dbFilePath)
  const writtenFiles: string[] = []

  const configPath = path.join(pkgRoot, "drizzle.config.ts")
  if (!(await readFileSafe(configPath))) {
    const rel = path.relative(pkgRoot, dbFilePath).replace(/\\/g, "/")
    await writeFileSafe(configPath, drizzleConfigTemplate(rel))
    writtenFiles.push(configPath)
  }

  const databasePath = path.join(dir, "database.ts")
  const alreadyConnection = /database\.ts$/.test(dbFilePath)
  if (!alreadyConnection && !(await readFileSafe(databasePath))) {
    await writeFileSafe(databasePath, databaseTemplate())
    writtenFiles.push(databasePath)
  }

  return { root: pkgRoot, writtenFiles }
}

function findPkgRoot(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/")
  const srcIdx = parts.lastIndexOf("src")
  if (srcIdx > 0) return parts.slice(0, srcIdx).join("/")
  return path.dirname(filePath)
}

async function runDrizzlePush(cwd: string): Promise<void> {
  const result = await bash(["bunx", "drizzle-kit", "push"], { cwd })
  if (result.exitCode !== 0) {
    throw new Error(
      `drizzle-kit push failed (exit ${result.exitCode}): ${result.stderr}`,
    )
  }
}

function drizzleConfigTemplate(schemaRel: string) {
  return `// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './${schemaRel}',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? './local.db',
  },
})
`
}

function databaseTemplate() {
  return `// database.ts
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { Database } from 'bun:sqlite'
import * as schema from './schema'

const sqlite = new Database(process.env.DATABASE_URL ?? './local.db')
export const db = drizzle(sqlite, { schema })
`
}
