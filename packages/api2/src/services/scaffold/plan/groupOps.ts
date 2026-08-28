import { existsSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative } from "node:path"
import { expandHome } from "@paladin/utils"
import { pathOf } from "../ops"
import type { FsOp, PathResolutionOpts, Project, Unit } from "../types"

function within(dir: string, abs: string): boolean {
  const rel = relative(dir, abs)
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel)
}

/** The project root an absolute path belongs to: a child of base, the active dir, or its own parent. */
function projectDirFor(abs: string, opts: PathResolutionOpts): string {
  const base = expandHome(opts.base ?? "~/projects")
  if (within(base, abs)) return join(base, relative(base, abs).split("/")[0]!)

  const active = opts.relativeTo ? expandHome(opts.relativeTo) : null
  if (active && within(active, abs)) return active

  return dirname(abs)
}

/** Files under packages/<name>/ belong to that unit; everything else belongs to the root unit. */
function locate(abs: string, opts: PathResolutionOpts) {
  const projectDir = projectDirFor(abs, opts)
  const projectName = basename(projectDir)
  const [head, name, ...rest] = relative(projectDir, abs).split("/")

  if (head === "packages" && name && name !== "scripts" && rest.length) {
    return { projectName, projectDir, unitName: name, unitDir: join(projectDir, "packages", name) }
  }

  return { projectName, projectDir, unitName: projectName, unitDir: projectDir }
}

/** Groups parsed ops into a project tree. The first op decides the project. */
export function groupOps(ops: FsOp[], opts: PathResolutionOpts): Project | null {
  const located = ops
    .map((op) => ({ op, path: pathOf(op) }))
    .filter((entry): entry is { op: FsOp; path: string } => entry.path !== null)

  const first = located[0]
  if (!first) return null

  const root = locate(first.path, opts)
  const units = new Map<string, Unit>()

  for (const { op, path } of located) {
    const loc = locate(path, opts)
    let unit = units.get(loc.unitDir)
    if (!unit) {
      unit = { name: loc.unitName, dir: loc.unitDir, isNew: !existsSync(loc.unitDir), ops: [] }
      units.set(loc.unitDir, unit)
    }
    unit.ops.push(op)
  }

  return {
    name: root.projectName,
    dir: root.projectDir,
    isNew: !existsSync(root.projectDir),
    units: [...units.values()],
  }
}
