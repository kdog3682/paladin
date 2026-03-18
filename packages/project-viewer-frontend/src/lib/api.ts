// @paladin/project-viewer-frontend/src/lib/api.ts
//
// Thin client over the backend REST API at :4800.
// Every function maps 1:1 to a backend route.

const BASE = "http://localhost:4800"

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  return res.json()
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" })
  return res.json()
}

import type { RepoData, GrepFilter, Session, Preset } from "../types"

/** Clone (if needed) and walk the repo tree. Returns full file listing. */
export function loadRepo(target: string) {
  return post<RepoData>("/repo/load", { target })
}

/** Read a single file's content for the viewer panel. */
export function loadFile(org: string, name: string, path: string) {
  return post<{ path: string, content: string }>("/repo/file", { org, name, path })
}

/** Run grep on the cloned repo. Paths param scopes search to visible files. */
export function grepRepo(org: string, name: string, pattern: string, paths: string[]) {
  return post<GrepFilter>("/repo/grep", { org, name, pattern, paths })
}

/** List sessions, optionally filtered to a specific repo. */
export function listSessions(repo?: string) {
  const q = repo ? `?repo=${encodeURIComponent(repo)}` : ""
  return get<Session[]>(`/sessions${q}`)
}

/** Fetch a single session by id. */
export function getSession(id: string) {
  return get<Session>(`/sessions/${id}`)
}

/** Create a new session. Backend assigns uuid if id is missing. */
export function createSession(session: Partial<Session>) {
  return post<Session>("/sessions", session)
}

/** Partial update — merges with existing session on the backend. */
export function updateSession(id: string, data: Partial<Session>) {
  return put<Session>(`/sessions/${id}`, data)
}

/** Delete a session by id. */
export function deleteSession(id: string) {
  return del<{ ok: boolean }>(`/sessions/${id}`)
}

/** List all saved filter presets. */
export function listPresets() {
  return get<Preset[]>("/presets")
}

/** Create a new filter preset (excluded categories + grep patterns). */
export function createPreset(preset: Partial<Preset>) {
  return post<Preset>("/presets", preset)
}

/** Delete a preset by id. */
export function deletePreset(id: string) {
  return del<{ ok: boolean }>(`/presets/${id}`)
}
