import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { findBin, q } from "./paths"
import type { Layout } from "./types"

export function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function kill(pid: number, settle: number) {
  if (!alive(pid)) return
  try {
    process.kill(pid, "SIGTERM")
  } catch {}

  const deadline = Date.now() + 2_000
  while (Date.now() < deadline && alive(pid)) await Bun.sleep(50)
  if (alive(pid)) {
    try {
      process.kill(pid, "SIGKILL")
    } catch {}
  }

  if (settle > 0) await Bun.sleep(settle)
}

/** the port webrun always serves on, so the url (and any open tab) survives a restart */
export const DEFAULT_PORT = 35737

function bindable(port: number) {
  try {
    Bun.serve({ port, hostname: "127.0.0.1", fetch: () => new Response("") }).stop(true)
    return true
  } catch {
    return false
  }
}

/** poll until `port` can be bound — a killed server's socket is released a beat after its pid goes */
export async function waitPortFree(port: number, timeout: number) {
  const deadline = Date.now() + timeout
  while (!bindable(port)) {
    if (Date.now() >= deadline) return false
    await Bun.sleep(50)
  }
  return true
}

export async function isUp(url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1_000) })
    return res.ok
  } catch {
    return false
  }
}

/** tabs connected to a webrun server, or null when it can't be asked (down, or vite too old to say) */
export async function clientCount(url: string) {
  try {
    const res = await fetch(new URL("__webrun/clients", url), { signal: AbortSignal.timeout(1_000) })
    const n = Number(await res.text())
    return res.ok && Number.isInteger(n) && n >= 0 ? n : null
  } catch {
    return null
  }
}

export async function waitReady(url: string, pid: number, timeout: number) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (!alive(pid)) return false
    if (await isUp(url)) return true
    await Bun.sleep(100)
  }
  return false
}

export async function tail(log: string, lines = 12) {
  try {
    const text = (await readFile(log, "utf8")).trim()
    if (!text) return ""
    return text.split("\n").slice(-lines).join("\n")
  } catch {
    return ""
  }
}

// vite stamps every log entry with a wall-clock time; anything else is a continuation
const ENTRY_START = /^\s*\d{1,2}:\d{2}:\d{2}(\s?[AP]M)?\s/i
const ANSI = /\x1b\[[0-9;]*m/g

/**
 * error entries written to the log at or after byte `from`, newest last, plus
 * the log's current size to resume from next time. a running server keeps
 * serving after a bad import or transform, so these never show up as a failed
 * start — they only exist in the log. repeats (vite re-logs on every request)
 * are collapsed.
 */
export async function newErrors(log: string, from = 0, max = 3, lines = 10) {
  let buf: Buffer
  try {
    buf = await readFile(log)
  } catch {
    return { errors: [], size: from }
  }
  // a log shorter than the offset was replaced underneath us — read it whole
  const text = buf.subarray(from <= buf.length ? from : 0).toString("utf8").replace(ANSI, "")

  const entries: string[][] = []
  for (const line of text.split("\n")) {
    if (ENTRY_START.test(line) || !entries.length) entries.push([line])
    else entries[entries.length - 1].push(line)
  }

  const seen = new Set<string>()
  const found: string[] = []
  for (const entry of entries.reverse()) {
    while (entry.length && !entry[entry.length - 1].trim()) entry.pop()
    if (!entry.length || !/error/i.test(entry[0])) continue
    const key = entry.join("\n").replace(ENTRY_START, "")
    if (seen.has(key)) continue
    seen.add(key)
    found.push(entry.slice(0, lines).join("\n"))
    if (found.length >= max) break
  }
  return { errors: found.reverse(), size: buf.length }
}

export async function spawnVite(layout: Layout, port: number) {
  const bin = findBin(layout.project, "vite")
  if (!bin) throw new Error(`vite is not installed in ${layout.project}`)

  const log = join(layout.workdir, "vite.log")
  const config = join(layout.workdir, "vite.config.ts")
  const cmd = `exec ${q(bin)} --config ${q(config)} --port ${port} --strictPort > ${q(log)} 2>&1`

  // `exec` hands the pid straight to vite, so the cached pid is the one to kill
  const proc = Bun.spawn(["sh", "-c", cmd], {
    cwd: layout.workdir,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
    // a shared vite.config.ts often branches on this, and `test` is the branch
    // we least want it to take
    env: { ...process.env, NODE_ENV: "development", VITEST: "" },
  })
  proc.unref()

  return { pid: proc.pid, log }
}
