import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { codeMerge } from "@paladin/codegen"
import { bash, deepMerge, isDir, rmDir, rmFile } from "@paladin/utils"
import { bashKey, byPurpose, isBash, isDelete, isDeprecated, isSkip, isWrite } from "./ops"
import type { ApplyResult, BashOp, BashOpResult, DeleteOp, FsOp, PathOp, WriteOp } from "./types"

type Json = Record<string, unknown>

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

/** Folds every op for one path into as few as possible, latest intent winning. */
function fold(ops: PathOp[]): PathOp[] {
  let disk: PathOp[] = []
  let pending: WriteOp | null = null

  for (const op of ops) {
    if (isSkip(op) || isDeprecated(op)) continue

    if (isDelete(op)) {
      disk = [op]
      pending = null
      continue
    }

    if (op.mode === "write") {
      disk = []
      pending = op
      continue
    }

    // an append or merge on top of content we already know in full
    if (pending) {
      const content =
        op.mode === "append"
          ? joinContent(pending.content, op.content)
          : mergeContent(pending.content, op.content)
      pending = { ...pending, content }
      continue
    }

    disk.push(op)
  }

  if (pending) return [pending]
  if (disk.length) return disk

  // nothing to do — keep the record of why
  const record = ops.find(isSkip) ?? ops[0]
  return record ? [record] : []
}

/**
 * Collapses the batch: deprecated paths drop out, per-path ops fold together,
 * duplicate commands go, and deletes that would eat something we're about to
 * write are discarded. Then it orders — deletes, writes, commands by purpose.
 */
export function mergeOps(ops: FsOp[]): FsOp[] {
  const deprecated = new Set(ops.filter(isDeprecated).map((op) => op.path))

  const byPath = new Map<string, PathOp[]>()
  const commands: BashOp[] = []
  const seen = new Set<string>()
  const records: FsOp[] = []

  for (const op of ops) {
    if (isBash(op)) {
      const key = bashKey(op)
      if (seen.has(key)) continue
      seen.add(key)
      commands.push(op)
      continue
    }

    if (isDeprecated(op)) {
      records.push(op)
      continue
    }

    if (deprecated.has(op.path)) continue

    const found = byPath.get(op.path)
    if (found) found.push(op)
    else byPath.set(op.path, [op])
  }

  const folded = [...byPath.values()].flatMap(fold)
  const writes = folded.filter(isWrite)
  const paths = new Set(writes.map((op) => op.path))

  const keep = (op: DeleteOp) =>
    !paths.has(op.path) && ![...paths].some((path) => path.startsWith(op.path + "/"))

  const deletes = folded.filter(isDelete).filter(keep)
  const skips = folded.filter(isSkip)

  return [...deletes, ...writes, ...commands.sort(byPurpose), ...skips, ...records]
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
  return { ...op, applied: true }
}

async function applyBash(op: BashOp): Promise<FsOp> {
  const run = await bash(op.args, { cwd: op.cwd })
  const result: BashOpResult = { ...run, purpose: op.purpose }
  const ok = run.exitCode === 0
  return { ...op, result, applied: true, reason: ok ? undefined : `exit ${run.exitCode}` }
}

/**
 * Carries out the batch and hands back every op with what became of it. A strict
 * command that exits non-zero stops the commands queued behind it; the files are
 * already on disk by then.
 */
export async function applyOperations(ops: FsOp[]): Promise<ApplyResult> {
  const plan = mergeOps(ops)
  const done: FsOp[] = []
  let halted: BashOp | null = null

  for (const op of plan) {
    if (isSkip(op) || isDeprecated(op)) {
      done.push({ ...op, applied: false })
      continue
    }

    if (halted && isBash(op)) {
      done.push({ ...op, applied: false, reason: `blocked by \`${halted.args.join(" ")}\`` })
      continue
    }

    try {
      if (isDelete(op)) done.push(await applyDelete(op))
      else if (isWrite(op)) done.push(await applyWrite(op))
      else {
        const result = await applyBash(op)
        done.push(result)
        if (op.strict && result.reason) halted = op
      }
    } catch (error) {
      done.push({ ...op, applied: false, reason: String(error) })
    }
  }

  return done
}
