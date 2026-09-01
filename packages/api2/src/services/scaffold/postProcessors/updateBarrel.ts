import { existsSync, readFileSync } from "node:fs"
import { basename, dirname, extname, join, relative, sep } from "node:path"
import { matchesAnyPath } from "@paladin/utils"
import { append, isWrite } from "../ops"
import { runnableKind } from "../runner"
import type { PostProcessorOptions } from "./types"
import type { FsOp, Unit, WriteOp } from "../types"

const BARREL = "src/index.ts"
const SOURCE = "updateBarrel"
const NAMED_INDEX = ".index"

type EntryTest = (path: string) => boolean

const stemOf = (path: string) => basename(path, extname(path))

/** `scaffold/scaffold.ts`, `components/Foobar/Foobar.tsx` */
const fileMatchesFolder: EntryTest = (path) => stemOf(path) === basename(dirname(path))

/** `foo/index.ts` */
const isIndexFile: EntryTest = (path) => stemOf(path) === "index"

/** `foobar.index.ts`, but not a bare `index.ts` */
const isNamedIndexFile: EntryTest = (path) => {
  const stem = stemOf(path)
  return stem.length > NAMED_INDEX.length && stem.endsWith(NAMED_INDEX)
}

/**
 * Sits directly beside the barrel (`src/foobar.ts`), or is the index of a folder
 * sitting directly beside it (`src/foobar/index.ts`). Anything deeper belongs to
 * the folder that owns it and reaches the barrel through that folder's entry, if
 * it reaches it at all.
 */
function fileRelativeToBarrel(barrel: string): EntryTest {
  const root = dirname(barrel)

  return (path) => {
    const rel = relative(root, path)
    if (!rel || rel.startsWith("..")) return false

    const depth = rel.split(sep).length
    if (depth === 1) return true
    return depth === 2 && isIndexFile(path)
  }
}

/**
 * The entry rules an in-scope unit has turned on, or null when this unit barrels
 * nothing — either it sits outside `matches` or every rule was turned off. A file
 * still has to earn its export; the rules only widen what counts as earning it.
 */
function barrelEntryTest(
  unit: Unit,
  barrel: string,
  opts: PostProcessorOptions,
): EntryTest | null {
  const {
    fileMatchesFolder: folderEntries = true,
    treatIndexAsEntry = true,
    treatNamedIndexAsEntry = true,
    fileRelativeToBarrelIndex = true,
    matches = [],
  } = opts.updateBarrel ?? {}

  if (matches.length && !matchesAnyPath(unit.dir, matches)) return null

  const tests: EntryTest[] = []
  if (folderEntries) tests.push(fileMatchesFolder)
  if (treatIndexAsEntry) tests.push(isIndexFile)
  if (treatNamedIndexAsEntry) tests.push(isNamedIndexFile)
  if (fileRelativeToBarrelIndex) tests.push(fileRelativeToBarrel(barrel))
  if (!tests.length) return null

  return (path) => tests.some((test) => test(path))
}

/**
 * Only brand new source files get exported. Nothing has been written yet at this
 * point in the pipeline, so a path that already exists on disk is a file the
 * barrel has had its chance to pick up.
 */
function exportable(unit: Unit, barrel: string, isEntry: EntryTest, op: FsOp): op is WriteOp {
  if (!isWrite(op) || op.mode !== "write") return false
  if (op.path === barrel || existsSync(op.path)) return false
  if (runnableKind(op.path)) return false
  if (!/\.tsx?$/.test(op.path)) return false
  if (!isEntry(op.path)) return false

  const rel = relative(unit.dir, op.path)
  if (!rel.startsWith("src/")) return false
  if (rel.startsWith("src/test/")) return false
  return true
}

function toExport(barrel: string, path: string): string {
  const rel = relative(dirname(barrel), path).replace(/\.tsx?$/, "")
  return `export * from "./${rel}"`
}

export function updateBarrel(unit: Unit, opts: PostProcessorOptions = {}): FsOp[] {
  const barrel = join(unit.dir, BARREL)

  const isEntry = barrelEntryTest(unit, barrel, opts)
  if (!isEntry) return []

  const existing = existsSync(barrel) ? readFileSync(barrel, "utf8") : ""

  // the unit may be authoring the barrel itself in this same pass
  const authored = unit.ops.find((op) => isWrite(op) && op.path === barrel) as WriteOp | undefined
  const current = existing + "\n" + (authored?.content ?? "")

  const lines = unit.ops
    .filter((op): op is WriteOp => exportable(unit, barrel, isEntry, op))
    .map((op) => toExport(barrel, op.path))
    .filter((line) => !current.includes(line))

  if (!lines.length) return []

  return [append(SOURCE, barrel, lines.join("\n") + "\n")]
}
