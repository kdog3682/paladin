// src/services/bootstrap/scaffold.ts

import { mkdir, writeFile } from "fs/promises"
import { dirname, join } from "path"
import { existsSync } from "fs"
import { glob } from "fast-glob"
import { log } from "../../logger"

// ── Types ───────────────────────────────────────────────────

type Variant = "vite" | "astro" | "next" | "server" | "default" | "root"

// ── Template Parser ─────────────────────────────────────────

function parseTemplate(raw: string): { path: string, content: string }[] {
  const blocks = raw
    .split(/^={3,}\s*$/m)
    .map((b) => b.trim())
    .filter(Boolean)

  const entries: { path: string, content: string }[] = []

  for (let i = 1; i < blocks.length - 1; i += 2) {
    entries.push({
      path: blocks[i],
      content: blocks[i + 1],
    })
  }

  return entries
}

// ── Detection ───────────────────────────────────────────────

async function detectVariant(packageDir: string): Promise<Variant> {
  let files: string[] = []
  try {
    files = await glob("**/*.{ts,tsx,astro}", {
      cwd: packageDir,
      ignore: ["node_modules/**", "dist/**"],
    })
  } catch {
    return "default"
  }

  const hasExt = (ext: string) => files.some((f) => f.endsWith(ext))
  const hasDir = (name: string) => files.some((f) => f.includes(`${name}/`))
  const hasFile = (name: string) => files.some((f) => f === name || f.endsWith(`/${name}`))

  if (hasExt(".astro")) return "astro"
  if (hasExt(".tsx") && hasDir("app")) return "next"
  if (hasExt(".tsx")) return "vite"
  if (hasFile("server.ts")) return "server"
  return "default"
}

// ── Main ────────────────────────────────────────────────────

/**
 * scaffold(rootDir, projectName, packageName?)
 *
 * No packageName → root monorepo scaffold at rootDir
 * With packageName → package scaffold at rootDir/packages/<packageName>
 *   variant auto-detected: .astro → astro | .tsx + /app/ → next | .tsx → vite | server.ts → server | default
 *
 * Skips if package.json already exists. Returns list of created file paths.
 */
export async function scaffold(
  rootDir: string,
  projectName: string,
  packageName?: string
): Promise<string[]> {
  const isRoot = !packageName
  const baseDir = isRoot ? rootDir : join(rootDir, "packages", packageName)

  if (existsSync(join(baseDir, "package.json"))) {
    return []
  }

  const variant: Variant = isRoot ? "root" : await detectVariant(baseDir)
  const tpl = await import(`./templates/${variant}.tpl`, { with: { type: "text" } })
  const entries = parseTemplate(tpl.default)
  const created: string[] = []

  for (const entry of entries) {
    const content = entry.content
      .replaceAll("{{PROJECT_NAME}}", projectName)
      .replaceAll("{{PACKAGE_NAME}}", packageName ?? "")
    const path = join(baseDir, entry.path)

    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content)
    created.push(path)
  }

  log.info(`scaffold: ${variant} → ${created.join(", ")}`)
  return created
}
