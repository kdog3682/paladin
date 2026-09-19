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

export function freePort() {
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") })
  const { port } = server
  server.stop(true)
  return port
}

export async function isUp(url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1_000) })
    return res.ok
  } catch {
    return false
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
