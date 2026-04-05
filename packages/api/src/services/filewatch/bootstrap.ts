// @paladin/packages/api/src/services/filewatch/bootstrap.ts

import { mkdir, writeFile, readdir } from "fs/promises"
import { dirname, join } from "path"
import { existsSync } from "fs"
import { log } from "../../logger"
import { getProjectInfo } from "../../utils/project"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Variant = "vite" | "astro" | "next" | "server" | "default" | "root"

// ---------------------------------------------------------------------------
// Template parser
// ---------------------------------------------------------------------------

function parseTemplate(raw: string): { path: string, content: string }[] {
  const blocks = raw
    .split(/^===\s*$/m)
    .map((b) => b.trim())
    .filter(Boolean)

  // blocks[0] is the comment header, then alternating [path, content, ...]
  const entries: { path: string, content: string }[] = []

  for (let i = 1; i < blocks.length - 1; i += 2) {
    entries.push({
      path: blocks[i],
      content: blocks[i + 1],
    })
  }

  return entries
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

async function detectVariant(packageDir: string): Promise<Variant> {
  let files: string[] = []
  try {
    files = await collectFiles(packageDir)
  } catch {
    return "default"
  }

  const hasExt = (ext: string) => files.some((f) => f.endsWith(ext))
  const hasDir = (name: string) => files.some((f) => f.includes(`/${name}/`))
  const hasFile = (name: string) => files.some((f) => f.endsWith(`/${name}`) || f === name)

  if (hasExt(".astro")) return "astro"
  if (hasExt(".tsx") && hasDir("app")) return "next"
  if (hasExt(".tsx")) return "vite"
  if (hasFile("server.ts")) return "server"
  return "default"
}

async function collectFiles(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const result: string[] = []
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory() && entry.name !== "node_modules") {
      result.push(...(await collectFiles(join(dir, entry.name), rel)))
    } else {
      result.push(rel)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * bootstrap(input, force?)
 *
 * "myproject"           → root monorepo scaffold
 * "myproject/dashboard" → package scaffold, variant auto-detected:
 *                         .astro → astro | .tsx + /app/ → next | .tsx → vite | server.ts → server | default
 *
 * Skips if package.json exists unless force=true.
 * Set process.env.TMP_DIR to override ~/projects base dir (for tests).
 */
export async function bootstrap(input: string, force = false): Promise<string[]> {
  const info = getProjectInfo(input)
  const isRoot = !info.packageName || !info.packageDir
  const baseDir = isRoot ? info.projectDir : info.packageDir!

  if (!force && existsSync(join(baseDir, "package.json"))) {
    return []
  }

  const variant: Variant = isRoot ? "root" : await detectVariant(baseDir)
  const tpl = await import(`./templates/${variant}.tpl`, { with: { type: "text" } })
  const entries = parseTemplate(tpl.default)
  const created: string[] = []

  for (const entry of entries) {
    const content = entry.content
      .replaceAll("{{PROJECT_NAME}}", info.projectName)
      .replaceAll("{{PACKAGE_NAME}}", info.packageName ?? "")
    const path = join(baseDir, entry.path)

    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content)
    created.push(path)
  }

  log.info(`bootstrap: ${variant} → ${created.join(", ")}`)
  return created
}
