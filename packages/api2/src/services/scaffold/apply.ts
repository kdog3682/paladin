import { existsSync, mkdirSync } from "node:fs"
import { dirname, relative } from "node:path"
import { codeMerge } from "@paladin/codegen"
import { bash, deepMerge, isDir, rmDir, rmFile } from "@paladin/utils"
import { bashKey, byPurpose, isBash, isDelete, isDeprecated, isSkip, isWrite } from "./ops"
import type {
  ApplyResult,
  ApplySummary,
  BashOp,
  BashOpResult,
  DeleteOp,
  FsOp,
  PathOp,
  Project,
  Unit,
  WriteOp,
} from "./types"

type Json = Record<string, unknown>

/** An op plus the unit that asked for it, so the project shape survives the merge. */
interface Owned<T extends FsOp = FsOp> {
  unit: Unit
  op: T
}

function asJson(text: string): Json | null {
  try {
    const parsed = JSON.parse(text)
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** JSON on both sides deep-merges; anything else is source, so codeMerge decides. */
function mergeContent(base: string, patch: string): string {
  const left = asJson(base)
  const right = asJson(patch)
  if (left && right) return JSON.stringify(deepMerge(left, right), null, 2) + "\n"
  return codeMerge(base, patch)
}

function joinContent(base: string, extra: string): string {
  if (!base) return extra
  return base.endsWith("\n") ? base + extra : base + "\n" + extra
}

/**
 * Folds every op for one path into as few as possible, latest intent winning.
 * Skips and deprecations drop out here; the unit that last touched the path owns
 * whatever comes out.
 */
function fold(entries: Owned<PathOp>[]): Owned<PathOp>[] {
  let disk: Owned<PathOp>[] = []
  let pending: Owned<WriteOp> | null = null

  for (const entry of entries) {
    const op = entry.op
    if (isSkip(op) || isDeprecated(op)) continue

    if (isDelete(op)) {
      disk = [{ unit: entry.unit, op }]
      pending = null
      continue
    }

    if (op.mode === "write") {
      disk = []
      pending = { unit: entry.unit, op }
      continue
    }

    // an append or merge on top of content we already know in full
    if (pending) {
      const content =
        op.mode === "append"
          ? joinContent(pending.op.content, op.content)
          : mergeContent(pending.op.content, op.content)
      pending = { unit: entry.unit, op: { ...pending.op, content } }
      continue
    }

    disk.push({ unit: entry.unit, op })
  }

  if (pending) return [pending]
  return disk
}

/**
 * Collapses the batch across the whole project: deprecated paths drop out, per-path
 * ops fold together, duplicate commands go, and deletes that would eat something
 * we're about to write are discarded. Then it orders — deletes, writes, commands by
 * purpose. Skips and deprecations never make it out.
 */
export function mergeOps(project: Project): Owned[] {
  const entries: Owned[] = project.units.flatMap((unit) =>
    unit.ops.map((op) => ({ unit, op }) as Owned),
  )

  const deprecated = new Set(
    entries
      .map((entry) => entry.op)
      .filter(isDeprecated)
      .map((op) => op.path),
  )

  const byPath = new Map<string, Owned<PathOp>[]>()
  const commands: Owned<BashOp>[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    const op = entry.op

    if (isBash(op)) {
      const key = bashKey(op)
      if (seen.has(key)) continue
      seen.add(key)
      commands.push({ unit: entry.unit, op })
      continue
    }

    if (isDeprecated(op) || deprecated.has(op.path)) continue

    const found = byPath.get(op.path)
    if (found) found.push({ unit: entry.unit, op })
    else byPath.set(op.path, [{ unit: entry.unit, op }])
  }

  const folded = [...byPath.values()].flatMap(fold)
  const writes = folded.filter((entry): entry is Owned<WriteOp> => isWrite(entry.op))
  const paths = new Set(writes.map((entry) => entry.op.path))

  const keep = (entry: Owned<DeleteOp>) =>
    !paths.has(entry.op.path) && ![...paths].some((path) => path.startsWith(entry.op.path + "/"))

  const deletes = folded
    .filter((entry): entry is Owned<DeleteOp> => isDelete(entry.op))
    .filter(keep)

  const ordered = commands.sort((a, b) => byPurpose(a.op, b.op))

  return [...deletes, ...writes, ...ordered]
}

async function applyDelete(op: DeleteOp): Promise<FsOp> {
  const result = isDir(op.path) ? rmDir(op.path) : rmFile(op.path)
  return { ...op, applied: result.removed, reason: result.reason }
}

async function applyWrite(op: WriteOp): Promise<FsOp> {
  const current = existsSync(op.path) ? await Bun.file(op.path).text() : null

  const content =
    current === null || op.mode === "write"
      ? op.content
      : op.mode === "append"
        ? joinContent(current, op.content)
        : mergeContent(current, op.content)

  if (current === content) return { ...op, applied: false, reason: "unchanged" }

  mkdirSync(dirname(op.path), { recursive: true })
  await Bun.write(op.path, content)
  return { ...op, applied: true, created: current === null }
}

async function applyBash(op: BashOp): Promise<FsOp> {
  const run = await bash(op.args, { cwd: op.cwd })
  const result: BashOpResult = { ...run, purpose: op.purpose }
  const ok = run.exitCode === 0
  return { ...op, result, applied: true, reason: ok ? undefined : `exit ${run.exitCode}` }
}

function failed(op: FsOp): boolean {
  if (isBash(op)) return Boolean(op.reason)
  return !op.applied && op.reason !== "unchanged"
}

function summarize(ops: FsOp[]): ApplySummary {
  const writes = ops.filter(isWrite)
  return {
    created: writes.filter((op) => op.applied && op.created).length,
    updated: writes.filter((op) => op.applied && !op.created).length,
    deleted: ops.filter(isDelete).filter((op) => op.applied).length,
    commands: ops.filter(isBash).length,
    failed: ops.filter(failed).length,
  }
}

/**
 * Disk is done with by now, so paths come home to the unit they belong to. An op
 * reaching outside its own unit still reads as such — `../other/src/index.ts`.
 */
function rebase(dir: string, op: FsOp): FsOp {
  if (isBash(op)) return { ...op, cwd: relative(dir, op.cwd) || "." }
  return { ...op, path: relative(dir, op.path) || "." }
}

/** Puts the finished ops back under the unit that asked for them, project order. */
function collect(project: Project, done: Owned[]): ApplyResult {
  const units = project.units.map((unit) => ({
    name: unit.name,
    dir: unit.dir,
    isNew: unit.isNew,
    ops: done
      .filter((entry) => entry.unit === unit)
      .map((entry) => rebase(unit.dir, entry.op)),
  }))

  return {
    name: project.name,
    dir: project.dir,
    isNew: project.isNew,
    units,
    summary: summarize(done.map((entry) => entry.op)),
  }
}

/**
 * Carries out the project and hands it back with what became of every op, grouped
 * by unit and relative to it. A strict command that exits non-zero stops the
 * commands queued behind it — anywhere in the project; the files are already on
 * disk by then.
 */
export async function applyOperations(project: Project): Promise<ApplyResult> {
  const plan = mergeOps(project)
  const done: Owned[] = []
  let halted: BashOp | null = null

  for (const { unit, op } of plan) {
    if (halted && isBash(op)) {
      const reason = `blocked by \`${halted.args.join(" ")}\``
      done.push({ unit, op: { ...op, applied: false, reason } })
      continue
    }

    try {
      if (isDelete(op)) done.push({ unit, op: await applyDelete(op) })
      else if (isWrite(op)) done.push({ unit, op: await applyWrite(op) })
      else {
        const result = await applyBash(op)
        done.push({ unit, op: result })
        if (op.strict && result.reason) halted = op
      }
    } catch (error) {
      done.push({ unit, op: { ...op, applied: false, reason: String(error) } })
    }
  }

  return collect(project, done)
}
