import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export const CACHE_DIR = join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "paladin", "storylite")
export const STATE_FILE = join(CACHE_DIR, "state.json")

/** the one server storylite keeps running between calls */
export type State = {
  target: string
  url: string
  port: number
  pid: number
  log: string
  startedAt: number
  /** how much of the log has been reported already */
  logOffset?: number
}

export async function readState(): Promise<State | null> {
  try {
    const it = JSON.parse(await readFile(STATE_FILE, "utf8"))
    const ok = ["target", "url", "log"].every((k) => typeof it[k] === "string") && ["port", "pid", "startedAt"].every((k) => typeof it[k] === "number")
    return ok ? (it as State) : null
  } catch {
    return null
  }
}

export async function writeState(state: State) {
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2))
}

export const clearState = () => rm(STATE_FILE, { force: true })
