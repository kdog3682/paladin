
// @paladin/scaffold/src/scaffold-typescript.ts
import { existsSync } from "fs"
import { readFile } from "fs/promises"
import { join } from "path"
import { bash } from "./bash"
import { bootstrap } from "./bootstrap"
import { writeFiles, type ScaffoldInput, type ScaffoldFile } from "./shared"
import { TS_IMPORT_RE, TS_TEST_RE, NODE_BUILTINS } from "./constants"

function isIgnored(spec: string): boolean {
  if (spec.startsWith("@/") || spec.startsWith(".") || spec.startsWith("node:") || spec.startsWith("bun:")) return true
  const bare = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]
  return NODE_BUILTINS.has(bare)
}

function collectImports(content: string, org: string): { workspace: string[], external: string[] } {
  const ws = new Set<string>()
  const ext = new Set<string>()
  const prefix = `@${org}/`
  for (const [, spec] of content.matchAll(TS_IMPORT_RE)) {
    if (isIgnored(spec)) continue
    const parts = spec.split("/")
    const pkg = spec.startsWith("@")
      ? parts.length >= 2 ? `${parts[0]}/${parts[1]}` : spec
      : parts[0]
    if (pkg.startsWith(prefix)) ws.add(pkg)
    else ext.add(pkg)
  }
  return { workspace: [...ws], external: [...ext] }
}

function inferBootstrapKey(files: ScaffoldFile[]): string {
  for (const f of files) {
    if (f.path.endsWith(".astro")) return "astro"
  }

  for (const f of files) {
    if (f.path.endsWith(".tsx")) return "web"
  }
}

export interface TypescriptInput extends ScaffoldInput {
  bootstrapRefs: Record<string, string>
}

/**
 * bootstrap, write, and install deps for typescript files.
 *
 * expects input.root to be the monorepo root (~/projects/org/)
 * and all file paths to be fully resolved by the orchestrator.
 * every file should have pkg and pkgDir set.
 */
export async function scaffoldTypescript(input: TypescriptInput): Promise<string[]> {
  const { org, root, files, bootstrapRefs } = input

  // group files by package
  const grouped: Record<string, { dir: string, files: ScaffoldFile[] }> = {}
  for (const f of files) {
    if (!f.pkg || !f.pkgDir) continue
    grouped[f.pkg] ??= { dir: f.pkgDir, files: [] }
    grouped[f.pkg].files.push(f)
  }

  // bootstrap root + packages
  let bootstrapped = false
  if (!existsSync(join(root, "package.json"))) {
    await bootstrap({ dir: root, org, key: "typescript-monorepo-root" })
    bootstrapped = true
  }
  for (const [name, { dir, files: pkgFiles }] of Object.entries(grouped)) {
    if (existsSync(join(dir, "package.json"))) continue
    const key = bootstrapRefs[name] ?? inferBootstrapKey(pkgFiles)
    await bootstrap({ dir, org, pkg: name, key })
    bootstrapped = true
  }

  await writeFiles(files)
  if (bootstrapped) await bash(["bun", "install"], { cwd: root })

  // install missing deps per package
  for (const [name, { dir, files: pkgFiles }] of Object.entries(grouped)) {
    const raw = await readFile(join(dir, "package.json"), "utf-8")
    const pkgJson = JSON.parse(raw)
    const existing = new Set([
      ...Object.keys(pkgJson.dependencies ?? {}),
      ...Object.keys(pkgJson.devDependencies ?? {}),
    ])
    const deps = new Set<string>()
    const devDeps = new Set<string>()
    for (const f of pkgFiles) {
      const imports = collectImports(f.content, org)
      const target = TS_TEST_RE.test(f.path) ? devDeps : deps
      for (const w of imports.workspace) if (!existing.has(w)) target.add(`${w}@workspace:*`)
      for (const e of imports.external) if (!existing.has(e)) target.add(e)
    }
    for (const d of deps) devDeps.delete(d)
    if (deps.size) await bash(["bun", "add", ...deps], { cwd: dir })
    if (devDeps.size) await bash(["bun", "add", "-d", ...devDeps], { cwd: dir })
  }

  return files.map(f => f.path)
}
