import { existsSync } from "node:fs"
import { isBuiltin } from "node:module"
import { basename, extname, join } from "node:path"
import { collectImports, expandHome } from "@paladin/utils"
import { bashOp, isWrite, merge } from "../ops"
import { localSpec, packageRoot } from "./localSpec"
import { VersionCache } from "./versions"
import type { FsOp, PathResolutionOpts, Project, Unit } from "../types"

const SOURCE = "resolveDependencies"
const DEFAULT_BASE = "~/projects"
const IMPORT_EXTS = new Set([".ts", ".tsx"])

type Manifest = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [key: string]: unknown
}

const isTestFile = (path: string) =>
  /\.(test|spec)\.[jt]sx?$/.test(path) || /(?:^|\/)(test|__tests__)\//.test(path)

const stripJsonComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")

/** Only what's being written — a skipped file is unchanged, so its imports are already declared. */
function sources(unit: Unit): { path: string; content: string }[] {
  return unit.ops.filter(isWrite).filter((op) => IMPORT_EXTS.has(extname(op.path)))
}

/** The manifest as it will exist: authored by this pass if present, otherwise from disk. */
async function readManifest(unit: Unit): Promise<Manifest> {
  const authored = unit.ops
    .filter(isWrite)
    .find((op) => basename(op.path) === "package.json" && op.mode === "write")
  if (authored) return JSON.parse(stripJsonComments(authored.content))

  const path = join(unit.dir, "package.json")
  return existsSync(path) ? JSON.parse(stripJsonComments(await Bun.file(path).text())) : {}
}

/** A merge op carrying only what the unit gained, or null when it needs nothing. */
async function manifestOp(
  unit: Unit,
  scope: string,
  base: string,
  versions: VersionCache,
): Promise<FsOp | null> {
  const manifest = await readManifest(unit)
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ])
  const self = `@${scope}/${unit.name}`

  const dependencies: Record<string, string> = {}
  const devDependencies: Record<string, string> = {}

  for (const src of sources(unit)) {
    const bucket = isTestFile(src.path) ? devDependencies : dependencies

    for (const ref of collectImports(src.content)) {
      if (ref.type === "local" || isBuiltin(ref.source)) continue

      const root = packageRoot(ref.source)
      if (root === self || declared.has(root)) continue
      if (root in dependencies || root in devDependencies) continue

      bucket[root] = localSpec(root, unit.dir, scope, base) ?? (await versions.spec(root))
    }
  }

  const gained: Manifest = {}
  if (Object.keys(dependencies).length) gained.dependencies = dependencies
  if (Object.keys(devDependencies).length) gained.devDependencies = devDependencies
  if (!Object.keys(gained).length) return null

  return merge(SOURCE, join(unit.dir, "package.json"), JSON.stringify(gained, null, 2) + "\n")
}

/**
 * What one unit needs: a merge op for its manifest, a merge op for anything the
 * version cache learned along the way, and an install at the project root. Units
 * that gain nothing ask for nothing; units that do all ask for the same install,
 * which folds into one command.
 */
export async function resolveDependencies(
  project: Project,
  unit: Unit,
  opts: PathResolutionOpts,
  versions: VersionCache = new VersionCache(opts.npmCachePath),
): Promise<FsOp[]> {
  const scope = project.name.replace(/^@/, "")
  const base = expandHome(opts.base ?? DEFAULT_BASE)

  const manifest = await manifestOp(unit, scope, base, versions)
  if (!manifest) return []

  const ops: FsOp[] = [manifest]

  const learned = versions.learned
  if (Object.keys(learned).length) {
    ops.push(merge(SOURCE, versions.path, JSON.stringify(learned, null, 2) + "\n"))
  }

  ops.push(bashOp(SOURCE, ["bun", "install"], "install", { cwd: project.dir, strict: true }))
  return ops
}
