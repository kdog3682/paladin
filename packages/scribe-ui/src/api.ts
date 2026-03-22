// @paladin/scribe-ui/src/api.ts

const BASE = "http://localhost:4800"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    const msg = `${init?.method ?? "GET"} ${path} → ${res.status}: ${err.error ?? res.statusText}`
    console.error(msg)
    throw new Error(err.error ?? res.statusText)
  }
  return res.json()
}

// -- Tickets --

import type {
  Ticket,
  Template,
  FileGroup,
  FileEntry,
  ScoredResult,
  SourceDir,
  GlobalFilters,
} from "./types"

export const tickets = {
  list: (params?: { status?: string, tag?: string, q?: string }) => {
    const sp = new URLSearchParams()
    if (params?.status) sp.set("status", params.status)
    if (params?.tag) sp.set("tag", params.tag)
    if (params?.q) sp.set("q", params.q)
    const qs = sp.toString()
    return request<Ticket[]>(`/tickets${qs ? `?${qs}` : ""}`)
  },
  get: (id: string) => request<Ticket>(`/tickets/${id}`),
  create: (data: Partial<Ticket>) =>
    request<Ticket>("/tickets", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Ticket>) =>
    request<Ticket>(`/tickets/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ ok: true }>(`/tickets/${id}`, { method: "DELETE" }),
  duplicate: (id: string) =>
    request<Ticket>(`/tickets/${id}/duplicate`, { method: "POST" }),
}

// -- Templates --

export const templates = {
  list: () => request<Template[]>("/templates"),
  get: (key: string) => request<Template>(`/templates/${key}`),
  create: (data: { name: string, content: string, key?: string }) =>
    request<Template>("/templates", { method: "POST", body: JSON.stringify(data) }),
  update: (key: string, data: Partial<Template>) =>
    request<Template>(`/templates/${key}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (key: string) =>
    request<{ ok: true }>(`/templates/${key}`, { method: "DELETE" }),
}

// -- File Groups --

export const fileGroups = {
  list: () => request<FileGroup[]>("/file-groups"),
  get: (id: string) => request<FileGroup>(`/file-groups/${id}`),
  create: (data: { name?: string, files: string[] }) =>
    request<FileGroup>("/file-groups", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<FileGroup>) =>
    request<FileGroup>(`/file-groups/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ ok: true }>(`/file-groups/${id}`, { method: "DELETE" }),
}

// -- Files --

export const files = {
  tree: () => request<FileEntry[]>("/files/tree"),
  read: (path: string) =>
    request<{ path: string, content: string }>(`/files/read?path=${encodeURIComponent(path)}`),
  search: (q: string) =>
    request<ScoredResult[]>(`/files/search?q=${encodeURIComponent(q)}`),
}

// -- Config --

export const config = {
  sourceDirs: {
    list: () => request<SourceDir[]>("/config/source-dirs"),
    create: (data: { path: string, include?: string, exclude?: string, visible?: boolean }) =>
      request<SourceDir>("/config/source-dirs", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<SourceDir>) =>
      request<SourceDir>(`/config/source-dirs/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ ok: true }>(`/config/source-dirs/${id}`, { method: "DELETE" }),
  },
  globalFilters: {
    get: () => request<GlobalFilters>("/config/global-filters"),
    update: (data: { include: string, exclude: string }) =>
      request<GlobalFilters>("/config/global-filters", { method: "PUT", body: JSON.stringify(data) }),
  },
}

// -- State --

export const state = {
  projectDir: {
    get: () => request<{ projectDir: string }>("/state/project-dir"),
    set: (projectDir: string) =>
      request<{ projectDir: string }>("/state/project-dir", {
        method: "PUT",
        body: JSON.stringify({ projectDir }),
      }),
  },
  recentFiles: {
    get: () => request<{ recentFiles: string[] }>("/state/recent-files"),
    set: (recentFiles: string[]) =>
      request<{ recentFiles: string[] }>("/state/recent-files", {
        method: "PUT",
        body: JSON.stringify({ recentFiles }),
      }),
  },
}
