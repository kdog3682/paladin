//
// codemod: strips legacy "main" / "types" from package.json files in ~/projects
// and removes "scripts" / "dependencies" when they are empty objects.
// then commits the touched files, one commit per project.
//
// scans:
//   ~/projects/<name>/package.json
//   ~/projects/<name>/<dir>/<pkg>/package.json   (monorepos: packages/*, apps/*, ...)
//
// writes and commits by default. pass --dry-run to preview.
//   bun run src/strip-legacy-pkg-fields.ts
//   bun run src/strip-legacy-pkg-fields.ts --dry-run

import { $ } from "bun"
import { readdir } from "node:fs/promises"
import type { Dirent } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const ROOT = join(homedir(), "projects")
const DRY_RUN = process.argv.includes("--dry-run")

const LEGACY_FIELDS = ["main", "types"] as const
const EMPTYABLE_FIELDS = ["scripts", "dependencies"] as const
const IGNORED_DIRS = new Set(["node_modules", "dist", "build", "out", "coverage"])
const COMMIT_SUBJECT = "chore: strip legacy package.json fields"

type Pkg = Record<string, unknown>

type CleanResult = {
  /* keys deleted from the package */
  removed: string[]
  /* keys intentionally left in place, with the reason */
  warnings: string[]
}

type Touched = {
  /* package.json path relative to the project root */
  rel: string
  /* keys deleted from that file */
  removed: string[]
}

const detectIndent = (text: string) => text.match(/^[ \t]+(?=")/m)?.[0] ?? "  "

const isEmptyObject = (value: unknown) =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length === 0

const listDirs = async (dir: string) => {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [] as Dirent[])
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !IGNORED_DIRS.has(e.name))
    .map((e) => e.name)
}

const findPackageJsons = async (projectDir: string) => {
  const candidates = ["package.json"]
  for (const a of await listDirs(projectDir)) {
    for (const b of await listDirs(join(projectDir, a))) {
      candidates.push(join(a, b, "package.json"))
    }
  }
  const found: string[] = []
  for (const rel of candidates) {
    if (await Bun.file(join(projectDir, rel)).exists()) found.push(rel)
  }
  return found
}

const clean = (pkg: Pkg): CleanResult => {
  const removed: string[] = []
  const warnings: string[] = []
  const hasExports = "exports" in pkg

  for (const key of LEGACY_FIELDS) {
    if (!(key in pkg)) continue
    // without "exports", removing main/types breaks resolution for consumers
    if (!hasExports) {
      warnings.push(`kept "${key}" (no "exports" field)`)
      continue
    }
    delete pkg[key]
    removed.push(key)
  }

  for (const key of EMPTYABLE_FIELDS) {
    if (key in pkg && isEmptyObject(pkg[key])) {
      delete pkg[key]
      removed.push(key)
    }
  }

  return { removed, warnings }
}

const isGitRepo = async (dir: string) =>
  (await $`git -C ${dir} rev-parse --is-inside-work-tree`.quiet().nothrow()).exitCode === 0

const isDirty = async (dir: string, rel: string) =>
  (await $`git -C ${dir} status --porcelain -- ${rel}`.quiet().nothrow()).text().trim() !== ""

const commit = async (dir: string, name: string, touched: Touched[]) => {
  const files = touched.map((t) => t.rel)
  const body = touched.map((t) => `- ${t.rel}: -${t.removed.join(", -")}`).join("\n")

  await $`git -C ${dir} add -- ${files}`.quiet()
  // passing paths commits only these files, leaving anything else staged untouched
  const res = await $`git -C ${dir} commit -m ${COMMIT_SUBJECT} -m ${body} -- ${files}`
    .quiet()
    .nothrow()

  if (res.exitCode === 0) console.log(`  ⎇ committed ${files.length} file(s)`)
  else console.error(`  ✗ ${name}: commit failed\n${res.stderr.toString().trim()}`)
}

const processProject = async (name: string) => {
  const dir = join(ROOT, name)
  const repo = await isGitRepo(dir)
  const touched: Touched[] = []

  for (const rel of await findPackageJsons(dir)) {
    const label = `${name}/${rel}`
    const path = join(dir, rel)
    const text = await Bun.file(path).text()

    let pkg: Pkg
    try {
      pkg = JSON.parse(text)
    } catch (err) {
      console.error(`✗ ${label}: failed to parse (${(err as Error).message})`)
      continue
    }

    const { removed, warnings } = clean(pkg)
    for (const warning of warnings) console.warn(`! ${label}: ${warning}`)
    if (removed.length === 0) continue

    // don't sweep someone's in-progress edits into the cleanup commit
    if (repo && (await isDirty(dir, rel))) {
      console.warn(`! ${label}: has uncommitted changes, skipped`)
      continue
    }

    console.log(`${DRY_RUN ? "~" : "✓"} ${label}: -${removed.join(", -")}`)
    touched.push({ rel, removed })

    if (!DRY_RUN) {
      const trailing = text.endsWith("\n") ? "\n" : ""
      await Bun.write(path, JSON.stringify(pkg, null, detectIndent(text)) + trailing)
    }
  }

  if (DRY_RUN || touched.length === 0) return touched.length
  if (repo) await commit(dir, name, touched)
  else console.warn(`! ${name}: not a git repo, changes left uncommitted`)
  return touched.length
}

let changed = 0
for (const name of await listDirs(ROOT)) {
  changed += await processProject(name)
}

console.log(
  DRY_RUN
    ? `\n${changed} file(s) would change. re-run without --dry-run to apply`
    : `\nupdated ${changed} package.json file(s)`,
)
