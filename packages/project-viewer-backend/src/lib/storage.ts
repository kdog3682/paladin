// @paladin/project-viewer-backend/src/lib/storage.ts
import { exists, mkdir, readdir, readFile, writeFile, unlink } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

const BASE = join(homedir(), ".cache", "project-viewer")
const SESSIONS_DIR = join(BASE, "sessions")
const PRESETS_DIR = join(BASE, "presets")

async function ensure(dir: string) {
  const ok = await exists(dir)
  if (!ok) await mkdir(dir, { recursive: true })
}

export type Session = {
  id: string
  name: string
  repo: string
  created: string
  updated: string
  bookmarks: string[]
  notes: string
  excluded: string[]
  greps: string[]
  preset?: string
}

export type Preset = {
  id: string
  name: string
  excluded: string[]
  greps: string[]
}

// --- sessions ---

export async function listSessions(repo?: string): Promise<Session[]> {
  await ensure(SESSIONS_DIR)
  const files = await readdir(SESSIONS_DIR)
  const all: Session[] = []

  for (const f of files) {
    if (!f.endsWith(".json")) continue
    const raw = await readFile(join(SESSIONS_DIR, f), "utf-8")
    const parsed = JSON.parse(raw) as Session
    if (repo && parsed.repo !== repo) continue
    all.push(parsed)
  }

  return all.sort((a, b) => b.updated.localeCompare(a.updated))
}

export async function getSession(id: string): Promise<Session | null> {
  await ensure(SESSIONS_DIR)
  const path = join(SESSIONS_DIR, `${id}.json`)
  const ok = await exists(path)
  if (!ok) return null
  const raw = await readFile(path, "utf-8")
  return JSON.parse(raw) as Session
}

export async function saveSession(session: Session): Promise<void> {
  await ensure(SESSIONS_DIR)
  session.updated = new Date().toISOString()
  const path = join(SESSIONS_DIR, `${session.id}.json`)
  await writeFile(path, JSON.stringify(session, null, 2))
}

export async function deleteSession(id: string): Promise<void> {
  const path = join(SESSIONS_DIR, `${id}.json`)
  const ok = await exists(path)
  if (ok) await unlink(path)
}

// --- presets ---

export async function listPresets(): Promise<Preset[]> {
  await ensure(PRESETS_DIR)
  const files = await readdir(PRESETS_DIR)
  const all: Preset[] = []

  for (const f of files) {
    if (!f.endsWith(".json")) continue
    const raw = await readFile(join(PRESETS_DIR, f), "utf-8")
    all.push(JSON.parse(raw) as Preset)
  }

  return all.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getPreset(id: string): Promise<Preset | null> {
  await ensure(PRESETS_DIR)
  const path = join(PRESETS_DIR, `${id}.json`)
  const ok = await exists(path)
  if (!ok) return null
  const raw = await readFile(path, "utf-8")
  return JSON.parse(raw) as Preset
}

export async function savePreset(preset: Preset): Promise<void> {
  await ensure(PRESETS_DIR)
  const path = join(PRESETS_DIR, `${preset.id}.json`)
  await writeFile(path, JSON.stringify(preset, null, 2))
}

export async function deletePreset(id: string): Promise<void> {
  const path = join(PRESETS_DIR, `${id}.json`)
  const ok = await exists(path)
  if (ok) await unlink(path)
}
