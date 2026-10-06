import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { findBin, stylesPath, stylesSource, type Plan } from "./find"

export const HOME = join(import.meta.dir, "..")
export const DEFAULT_PORT = 6007

/** a port nothing is listening on, for runs that don't need a stable url */
export function freePort() {
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") })
  const { port } = server
  server.stop(true)
  return port!
}

export async function isUp(url: string) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1_000) })).ok
  } catch {
    return false
  }
}

async function tail(log: string, lines = 12) {
  const text = (await readFile(log, "utf8").catch(() => "")).trim()
  return text.split("\n").slice(-lines).join("\n")
}

export type Server = {
  pid: number
  url: string
  /** vite's combined stdout/stderr */
  log: string
  exited: Promise<number>
  stop(): void
}

/**
 * vite on the plan's project, serving the story page. the one thing written to
 * disk is the stylesheet (tailwind can't process a virtual css module); the rest
 * is the static config next to this file.
 */
export async function serve(plan: Plan, port: number, { detach = false, timeout = 20_000 } = {}): Promise<Server> {
  const bin = findBin(HOME, "vite")
  if (!bin) throw new Error("vite is not installed")

  await mkdir(plan.workdir, { recursive: true })
  if (plan.tailwind) await writeFile(stylesPath(plan), stylesSource(plan))

  const log = join(plan.workdir, "vite.log")
  const proc = Bun.spawn([bin, "--config", join(HOME, "src", "config.ts"), "--port", String(port), "--strictPort"], {
    cwd: plan.project,
    detached: detach,
    stdin: "ignore",
    stdout: Bun.file(log),
    stderr: Bun.file(log),
    // a shared vite.config.ts often branches on this, and `test` is the branch we least want
    env: { ...process.env, NODE_ENV: "development", VITEST: "", STORYLITE_PLAN: JSON.stringify(plan), STORYLITE_HOME: HOME },
  })

  if (detach) proc.unref()

  const url = `http://127.0.0.1:${port}/`
  const stop = () => proc.kill()
  const server = { pid: proc.pid, url, log, exited: proc.exited, stop }

  const deadline = Date.now() + timeout
  while (!(await isUp(url))) {
    if (proc.exitCode !== null || Date.now() > deadline) {
      stop()
      throw new Error((await tail(log)) || `vite did not come up on port ${port}`)
    }
    await Bun.sleep(100)
  }
  return server
}

export function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** SIGTERM, then SIGKILL if it hangs; returns once the pid is gone */
export async function stopPid(pid: number) {
  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    if (!alive(pid)) return
    try {
      process.kill(pid, signal)
    } catch {}
    const deadline = Date.now() + 2_000
    while (alive(pid) && Date.now() < deadline) await Bun.sleep(50)
  }
}

/** poll until `port` can be bound — a killed server's socket is released a beat after its pid goes */
export async function waitPortFree(port: number, timeout = 3_000) {
  const deadline = Date.now() + timeout
  for (;;) {
    try {
      Bun.serve({ port, hostname: "127.0.0.1", fetch: () => new Response("") }).stop(true)
      return true
    } catch {
      if (Date.now() >= deadline) return false
      await Bun.sleep(50)
    }
  }
}
