import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { WebrunState } from "./types"

export const CACHE_DIR = join(
  process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
  "paladin",
  "webrun",
)

export const STATE_FILE = join(CACHE_DIR, "state.json")

export const STATE_VERSION = 3

/**
 * the state file outlives the binary that wrote it, so a field added in a later
 * version shows up here as `undefined` on someone's machine and takes out the
 * first thing that touches it.
 *
 * the identity fields must be right or the state is worthless — we can't kill
 * or reuse a server we can't address, so a bad one is dropped. everything else
 * is cosmetic and gets a sane fill-in, which keeps an old-but-live server
 * addressable instead of orphaning its pid.
 */
function coerce(raw: unknown): WebrunState | null {
  if (!raw || typeof raw !== "object") return null
  const it = raw as Record<string, unknown>

  const { app, url, workdir, pid, port } = it
  if (typeof app !== "string" || typeof url !== "string" || typeof workdir !== "string") return null
  if (typeof pid !== "number" || typeof port !== "number") return null

  return {
    version: STATE_VERSION,
    app,
    url,
    workdir,
    pid,
    port,
    log: typeof it.log === "string" ? it.log : join(workdir, "vite.log"),
    mode: it.mode === "passthrough" ? "passthrough" : "virtual",
    startedAt: typeof it.startedAt === "number" ? it.startedAt : Date.now(),
    runs: typeof it.runs === "number" ? it.runs : 1,
    logOffset: typeof it.logOffset === "number" ? it.logOffset : 0,
  }
}

export async function readState(): Promise<WebrunState | null> {
  try {
    return coerce(JSON.parse(await readFile(STATE_FILE, "utf8")))
  } catch {
    return null
  }
}

export async function writeState(state: Omit<WebrunState, "version">) {
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(STATE_FILE, JSON.stringify({ ...state, version: STATE_VERSION }, null, 2))
}

export async function clearState() {
  await rm(STATE_FILE, { force: true })
}
