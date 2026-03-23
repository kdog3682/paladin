// @paladin/scaffold-v2/matchers.ts

import { existsSync } from "fs"
import { join } from "path"
import { writeFileSafe } from "@paladin/utils/fs"
import { bootstrap } from "./bootstrap"
import { hasImport } from "./get-imports"
import type { PackageContext, MatcherResult, Matcher } from "./types"

// --- built-in matchers ---

/**
 * bootstrap a new package from a template inferred by file extensions.
 * only fires for new packages.
 */
export const bootstrapMatcher: Matcher = async (pkg) => {
  if (!pkg.isNew) return { matched: false }

  let key: string | undefined
  for (const f of pkg.files) {
    if (f.absolutePath.endsWith(".astro")) { key = "astro"; break }
    if (f.absolutePath.endsWith(".tsx")) { key = "web"; break }
  }

  const created = await bootstrap({
    dir: pkg.packageDir,
    projectName: pkg.projectName,
    packageName: pkg.packageName,
    key,
  })

  return { matched: true, filesCreated: created }
}

/**
 * detect drizzle usage via import table on schema files.
 * creates drizzle.config.ts and returns the generate command.
 * terminal — subsequent matchers are skipped for this package.
 */
export const drizzleMatcher: Matcher = async (pkg) => {
  const schemaFile = pkg.files.find(
    f => f.absolutePath.includes("schema.ts") || f.absolutePath.includes("schema/")
  )
  if (!schemaFile) return { matched: false }
  if (!hasImport(schemaFile.importTable, "drizzle-orm")) return { matched: false }

  const created: string[] = []
  const configPath = join(pkg.packageDir, "drizzle.config.ts")

  if (!existsSync(configPath)) {
    const schemaRel = schemaFile.absolutePath.slice(pkg.packageDir.length + 1)
    const config = [
      `import { defineConfig } from "drizzle-kit"`,
      ``,
      `export default defineConfig({`,
      `  schema: "./${schemaRel}",`,
      `  dialect: "sqlite",`,
      `  out: "./drizzle",`,
      `})`,
      ``,
    ].join("\n")
    writeFileSafe(configPath, config)
    created.push(configPath)
  }

  return {
    matched: true,
    terminal: true,
    filesCreated: created,
    commands: [{ cmd: ["bunx", "drizzle-kit", "generate"], cwd: pkg.packageDir }],
  }
}

// --- default set ---

export const defaultMatchers: Matcher[] = [
  bootstrapMatcher,
  drizzleMatcher,
]
