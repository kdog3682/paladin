// @paladin/tooling/package-transfer/entry.ts
import { join, basename, extname } from "path"
import { readFile, readdir } from "fs/promises"
import { fileExists, log, logError } from "./utils"

const CANDIDATE_ENTRIES = [
  "src/index.ts",
  "src/index.tsx",
  "src/main.ts",
  "src/main.tsx",
  "index.ts",
  "index.tsx",
  "main.ts",
  "main.tsx",
]

export async function determineEntryPoint(pkgDir: string): Promise<string> {
  const pkgJsonPath = join(pkgDir, "package.json")
  const raw = await readFile(pkgJsonPath, "utf-8")
  const pkgJson = JSON.parse(raw)

  // 1. check package.json main/exports for a source reference
  const declaredEntry = extractDeclaredEntry(pkgJson)
  if (declaredEntry) {
    const resolved = resolveSourceEntry(declaredEntry)
    const fullPath = join(pkgDir, resolved)
    if (await fileExists(fullPath)) {
      log(`Entry from package.json: ${resolved}`)
      return resolved
    }
  }

  // 2. check common candidate paths
  for (const candidate of CANDIDATE_ENTRIES) {
    if (await fileExists(join(pkgDir, candidate))) {
      log(`Entry from convention: ${candidate}`)
      return candidate
    }
  }

  // 3. look for a single ts/tsx file in src/ or root
  const srcSingle = await findSingleSourceFile(join(pkgDir, "src"))
  if (srcSingle) {
    const entry = `src/${srcSingle}`
    log(`Entry from single file in src/: ${entry}`)
    return entry
  }

  const rootSingle = await findSingleSourceFile(pkgDir)
  if (rootSingle) {
    log(`Entry from single file at root: ${rootSingle}`)
    return rootSingle
  }

  logError(`Could not determine entry point for ${pkgDir}`)
  process.exit(1)
}

function extractDeclaredEntry(pkgJson: Record<string, any>): string | null {
  if (typeof pkgJson.main === "string") return pkgJson.main

  if (pkgJson.exports) {
    const root = pkgJson.exports["."]
    if (typeof root === "string") return root
    if (root?.import) return root.import
    if (root?.default) return root.default
  }

  return null
}

function resolveSourceEntry(declared: string): string {
  // if it points to dist output, map back to source
  const mapped = declared
    .replace(/^\.\//, "")
    .replace(/^dist\//, "src/")
    .replace(/\.js$/, ".ts")
    .replace(/\.mjs$/, ".ts")
    .replace(/\.cjs$/, ".ts")
    .replace(/\.d\.ts$/, ".ts")

  return mapped
}

async function findSingleSourceFile(dir: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const tsFiles = entries.filter(
    (e) => e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".tsx"))
      && !e.name.endsWith(".d.ts") && !e.name.endsWith(".test.ts")
  )

  if (tsFiles.length === 1) return tsFiles[0].name
  return null
}

export function entryToOutputPath(entryPoint: string): string {
  return entryPoint
    .replace(/^src\//, "")
    .replace(/\.tsx?$/, ".js")
}
