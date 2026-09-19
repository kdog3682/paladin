import { existsSync, readFileSync } from "node:fs"
import { basename, dirname, extname, join, relative, sep } from "node:path"
import { matchesAnyPath } from "@paladin/utils"
import { append, isWrite } from "../ops"
import { isRunnable } from "../runner"
import type { PostProcessorOptions } from "./types"
import type { FsOp, Unit, WriteOp } from "../types"

const BARREL = "src/index.ts"
const SOURCE = "updateBarrel"
const NAMED_INDEX = ".index"
const SOURCE_EXT = /\.tsx?$/
const EXPORT_SPEC = /from\s+["'](\.[^"']*)["']/g

type EntryTest = (path: string) => boolean

type BarrelContext = {
  unit: Unit
  barrel: string
  isEntry: EntryTest
  isOwned: EntryTest
}

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

/** A file that speaks for the folder it sits in: `bash/bash.ts` or `bash/index.ts`. */
const isFolderEntry: EntryTest = (path) => fileMatchesFolder(path) || isIndexFile(path)

/** `dir` is somewhere strictly below `root`. */
function inside(root: string, dir: string): boolean {
  const rel = relative(root, dir)
  return rel !== "" && !rel.startsWith("..")
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
 * Every source file under these paths is an entry, whatever it is named and
 * however deep it sits. This is the rule for flat category layouts — `fs/`,
 * `path/`, `string/` holding their members directly — where the file name is
 * the export and no folder speaks for the folder.
 *
 * Matched against the file, not the unit, so it can be scoped to a package
 * (`packages/utils/**`) or to one folder inside it (`packages/utils/src/fs/*`).
 * Ownership still applies on top: the moment a folder grows a real entry, that
 * entry answers for the folder and the barrel stops reaching past it.
 */
function alwaysBarrelTest(paths: string[]): EntryTest {
  return (path) => matchesAnyPath(path, paths)
}

/**
 * The entry rules an in-scope unit has turned on, or null when this unit barrels
 * nothing — either it sits outside `matches` or every rule was turned off. A file
 * still has to earn its export; the rules only widen what counts as earning it.
 *
 * `matches` is a scope gate, not a rule: failing it switches the processor off
 * for this unit, and no `alwaysBarrel` entry will bring it back.
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
    alwaysBarrel = [],
    matches = [],
  } = opts.updateBarrel ?? {}

  if (matches.length && !matchesAnyPath(unit.dir, matches)) return null

  const tests: EntryTest[] = []
  if (alwaysBarrel.length) tests.push(alwaysBarrelTest(alwaysBarrel))
  if (folderEntries) tests.push(fileMatchesFolder)
  if (treatIndexAsEntry) tests.push(isIndexFile)
  if (treatNamedIndexAsEntry) tests.push(isNamedIndexFile)
  if (fileRelativeToBarrelIndex) tests.push(fileRelativeToBarrel(barrel))
  if (!tests.length) return null

  return (path) => tests.some((test) => test(path))
}

/** A folder that already has an entry sitting on disk. */
function folderEntryOnDisk(dir: string): boolean {
  const name = basename(dir)
  const candidates = ["index.ts", "index.tsx", `${name}.ts`, `${name}.tsx`]
  return candidates.some((file) => existsSync(join(dir, file)))
}

/**
 * Folders the barrel already reaches, read back out of its own text. `./bash`,
 * `./bash/index` and `./bash/bash` all mean the same thing: `bash` is exported.
 */
function foldersExportedBy(root: string, content: string): Set<string> {
  const dirs = new Set<string>()

  for (const [, spec] of content.matchAll(EXPORT_SPEC)) {
    const resolved = join(root, spec.replace(SOURCE_EXT, ""))
    dirs.add(isFolderEntry(resolved) ? dirname(resolved) : resolved)
  }

  return dirs
}

/**
 * A folder reaching the barrel through its own entry owns everything below it.
 * Once `bash/bash.ts` exists — written in this pass, already on disk, or already
 * named in the barrel — a later `bash/Smth/Smth.ts` is bash's business to export,
 * so the barrel leaves it alone rather than reaching past the entry.
 *
 * A folder named in the barrel only because its own members are listed there
 * (`./fs/mergeJson`) is not claimed by that listing: `foldersExportedBy` records
 * the member path, not its parent, so sibling members stay exportable.
 */
function folderOwnershipTest(unit: Unit, barrel: string, current: string): EntryTest {
  const root = dirname(barrel)
  const claimed = foldersExportedBy(root, current)

  for (const op of unit.ops) {
    if (isWrite(op) && isFolderEntry(op.path)) claimed.add(dirname(op.path))
  }

  const owns = (dir: string) => claimed.has(dir) || folderEntryOnDisk(dir)

  return (path) => {
    // an entry answers for its own folder, so ownership starts one level up
    let dir = isFolderEntry(path) ? dirname(dirname(path)) : dirname(path)

    while (inside(root, dir)) {
      if (owns(dir)) return true
      dir = dirname(dir)
    }

    return false
  }
}

/**
 * Only brand new source files get exported. Nothing has been written yet at this
 * point in the pipeline, so a path that already exists on disk is a file the
 * barrel has had its chance to pick up.
 */
function exportable(ctx: BarrelContext, op: FsOp): op is WriteOp {
  const { unit, barrel, isEntry, isOwned } = ctx

  if (!isWrite(op) || op.mode !== "write") return false
  if (op.path === barrel || existsSync(op.path)) return false
  if (isRunnable(op.path)) return false
  if (!SOURCE_EXT.test(op.path)) return false
  if (!isEntry(op.path)) return false
  if (isOwned(op.path)) return false

  const rel = relative(unit.dir, op.path)
  if (!rel.startsWith("src/")) return false
  if (rel.startsWith("src/test/")) return false
  return true
}

function toExport(barrel: string, path: string): string {
  const rel = relative(dirname(barrel), path).replace(SOURCE_EXT, "")
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

  const ctx: BarrelContext = {
    unit,
    barrel,
    isEntry,
    isOwned: folderOwnershipTest(unit, barrel, current),
  }

  const lines = unit.ops
    .filter((op) => exportable(ctx, op))
    .map((op) => toExport(barrel, op.path))
    .filter((line) => !current.includes(line))

  if (!lines.length) return []

  return [append(SOURCE, barrel, lines.join("\n") + "\n")]
}
