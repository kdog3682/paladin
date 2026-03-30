// @paladin/scaffold-v3/scaffold/matchers/drizzle.ts

import { existsSync } from "fs"
import { join } from "path"
import { hasImport } from "../get-imports"
import type { Matcher, CreatedFile } from "./types"

/**
 * detect drizzle usage via imports on schema files.
 * creates drizzle.config.ts and returns the generate command.
 * terminal — subsequent matchers are skipped for this package.
 */
export const drizzleMatcher: Matcher = async (pkg) => {
  const schemaFile = pkg.files.find(
    f => f.relativePath.includes("schema.ts") || f.relativePath.includes("schema/"),
  )
  if (!schemaFile) return { matched: false }
  if (!hasImport(schemaFile.imports, "drizzle-orm")) return { matched: false }

  const filesCreated: CreatedFile[] = []
  const configPath = join(pkg.packageDir, "drizzle.config.ts")

  if (!existsSync(configPath)) {
    const content = [
      `import { defineConfig } from "drizzle-kit"`,
      ``,
      `export default defineConfig({`,
      `  schema: "./${schemaFile.relativePath}",`,
      `  dialect: "sqlite",`,
      `  out: "./drizzle",`,
      `})`,
      ``,
    ].join("\n")
    filesCreated.push({ absolutePath: configPath, content })
  }

  return {
    matched: true,
    terminal: true,
    filesCreated,
    commands: [{ cmd: ["bunx", "drizzle-kit", "generate"], cwd: pkg.packageDir }],
  }
}
