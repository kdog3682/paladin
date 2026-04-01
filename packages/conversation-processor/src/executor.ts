// @paladin/conversation-processor/executor.ts

import { readFile, writeFile, mkdir, unlink } from "fs/promises"
import { existsSync, readFileSync } from "fs"
import { dirname } from "path"
import { bash } from "@paladin/utils/bash"
import type { BashResult } from "@paladin/utils/bash"
import type { FileOp } from "./types"

export type ExecutorResult = {
  bashResults: BashResult[]
}

export async function execute(
  ops: FileOp[],
  workspaceRoot: string,
): Promise<ExecutorResult> {
  const bashResults: BashResult[] = []

  // collect paths that have a write — these win over delete
  const writtenPaths = new Set(
    ops
      .filter(op => op.kind === "write" || op.kind === "append")
      .map(op => op.path),
  )

  // 1. deletes (skip if a write exists for same path)
  const deleteOps = ops.filter(op => op.kind === "delete")
  for (const op of deleteOps) {
    if (writtenPaths.has(op.path)) continue
    if (existsSync(op.path)) await unlink(op.path)
  }

  // 2. writes
  const writeOps = ops.filter(op => op.kind === "write")
  for (const op of writeOps) {
    await ensureDir(op.path)
    await writeFile(op.path, op.content)
  }

  // 3. appends
  const appendOps = ops.filter(op => op.kind === "append")
  for (const op of appendOps) {
    await ensureDir(op.path)
    // TODO: AST merge via swc/jscodeshift
    const existing = existsSync(op.path)
      ? await readFile(op.path, "utf-8")
      : ""
    await writeFile(op.path, existing + "\n" + op.content)
  }

  // 4. json writes + patches
  const jsonOps = resolveJsonOps(ops)
  for (const [path, data] of jsonOps) {
    await ensureDir(path)
    await writeFile(path, JSON.stringify(data, null, 2))
  }

  // 5. bun install if deps changed
  const needsInstall = ops.some(
    op => op.kind === "write-json"
    || (op.kind === "patch-json" && op.reason === "deps"),
  )
  if (needsInstall) {
    const result = await bash(["bun", "install"], { cwd: workspaceRoot })
    bashResults.push(result)
  }

  // 6. run ops
  const runOps = ops.filter(op => op.kind === "run")
  for (const op of runOps) {
    const result = await bash(op.cmd, { cwd: op.cwd })
    bashResults.push(result)
  }

  return { bashResults }
}

function resolveJsonOps(ops: FileOp[]): Map<string, Record<string, unknown>> {
  const resolved = new Map<string, Record<string, unknown>>()

  for (const op of ops) {
    if (op.kind === "write-json") {
      resolved.set(op.path, op.data)
    }

    if (op.kind === "patch-json") {
      const base = resolved.get(op.path)
        ?? (existsSync(op.path)
          ? JSON.parse(readFileSync(op.path, "utf-8"))
          : {})

      resolved.set(op.path, deepMerge(base, op.merge))
    }
  }

  return resolved
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target }

  for (const key of Object.keys(source)) {
    const t = target[key]
    const s = source[key]

    if (isObj(t) && isObj(s)) {
      result[key] = deepMerge(t, s)
    } else {
      result[key] = s
    }
  }

  return result
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

async function ensureDir(path: string) {
  await mkdir(dirname(path), { recursive: true })
}
