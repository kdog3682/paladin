/*
 * Backend contract, served by api2's ts-morph route group. Every path below is relative to
 * BASE, so the dev server only needs the one /api proxy entry.
 *
 * GET  /packages?withinDays=30          -> PackageInfo[]
 * GET  /tree?root=<abs>                 -> FsNode
 * GET  /symbols?file=<abs>              -> SymbolInfo[]
 * GET  /project-symbols?root=<abs>      -> ProjectSymbol[]
 * GET  /symbol-detail?file=<abs>&name=  -> SymbolDetail
 * POST /rename-path    { from, to }
 * POST /delete-path    { path }
 * POST /rename-symbol  { file, name, newName }
 * POST /run-file       { file }         -> RunResult
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "./components/Toasts"
import { useWorkspace } from "./store"
import { basename } from "./lib/paths"

export type PackageInfo = {
  /* package name, ie "utils" */
  name: string
  /* project name, ie "paladin" */
  project: string
  /* absolute path to ~/projects/<project>/packages/<name> */
  root: string
  /* last modified time in ms */
  mtime: number
}

export type FsNode = {
  name: string
  /* absolute path */
  path: string
  kind: "file" | "dir"
  children?: FsNode[]
}

export type SymbolKind = "function" | "class" | "interface" | "type" | "variable" | "enum"

export type MethodInfo = {
  name: string
  signature: string
  docs?: string
}

export type SymbolInfo = {
  name: string
  kind: SymbolKind
  exported: boolean
  /* abbreviated signature, ie "function foo(a: string): number" */
  signature: string
  docs?: string
  /* full source text of the declaration */
  text: string
  line: number
  /* only present for classes */
  methods?: MethodInfo[]
}

export type ProjectSymbol = {
  name: string
  kind: SymbolKind
  /* absolute path of the declaring file */
  file: string
  exported: boolean
  line: number
}

export type TypeRef = {
  name: string
  text: string
  file: string
  line: number
}

export type Reference = {
  file: string
  line: number
  /* the line of source containing the reference */
  text: string
  /* enclosing top-level symbol, when there is one */
  symbol?: string
}

export type SymbolDetail = {
  types: TypeRef[]
  references: Reference[]
}

export type RunResult = {
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}

const BASE = "/api/ts-morph"

const qs = (params: Record<string, string>) => new URLSearchParams(params).toString()

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export const keys = {
  all: ["ts-morph"] as const,
  packages: ["ts-morph", "packages"] as const,
  tree: (root: string | null) => ["ts-morph", "tree", root] as const,
  symbols: (file: string | null) => ["ts-morph", "symbols", file] as const,
  projectSymbols: (root: string | null) => ["ts-morph", "project-symbols", root] as const,
  detail: (file: string | null, name: string | null) => ["ts-morph", "detail", file, name] as const,
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000
const PACKAGES_CACHE = "symbol-viewer.packages"
const PACKAGES_TTL = 60 * 60 * 1000

type PackagesCache = { at: number, data: PackageInfo[] }

function readPackagesCache(): PackagesCache | undefined {
  try {
    const raw = localStorage.getItem(PACKAGES_CACHE)
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

/* packages touched within the past month, most recent first. cached in localStorage so we don't reindex on every load */
export function usePackages() {
  const cached = readPackagesCache()
  return useQuery({
    queryKey: keys.packages,
    queryFn: async () => {
      const list = await getJson<PackageInfo[]>(`/packages?${qs({ withinDays: "30" })}`)
      const cutoff = Date.now() - MONTH_MS
      const data = list.filter((p) => p.mtime >= cutoff).sort((a, b) => b.mtime - a.mtime)
      localStorage.setItem(PACKAGES_CACHE, JSON.stringify({ at: Date.now(), data }))
      return data
    },
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.at,
    staleTime: PACKAGES_TTL,
  })
}

export function useTree(root: string | null) {
  return useQuery({
    queryKey: keys.tree(root),
    queryFn: () => getJson<FsNode>(`/tree?${qs({ root: root! })}`),
    enabled: !!root,
    staleTime: 5 * 60 * 1000,
  })
}

export function useSymbols(file: string | null) {
  return useQuery({
    queryKey: keys.symbols(file),
    queryFn: () => getJson<SymbolInfo[]>(`/symbols?${qs({ file: file! })}`),
    enabled: !!file,
    staleTime: 60 * 1000,
  })
}

export function useProjectSymbols(root: string | null) {
  return useQuery({
    queryKey: keys.projectSymbols(root),
    queryFn: () => getJson<ProjectSymbol[]>(`/project-symbols?${qs({ root: root! })}`),
    enabled: !!root,
    staleTime: 5 * 60 * 1000,
  })
}

export function useSymbolDetail(file: string | null, name: string | null) {
  return useQuery({
    queryKey: keys.detail(file, name),
    queryFn: () => getJson<SymbolDetail>(`/symbol-detail?${qs({ file: file!, name: name! })}`),
    enabled: !!file && !!name,
    staleTime: 60 * 1000,
  })
}

export function useFsMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: keys.all })
  const onError = (e: Error) => toast.error(e.message)

  const renamePath = useMutation({
    mutationFn: (v: { from: string, to: string }) => postJson<void>("/rename-path", v),
    onSuccess: (_, v) => {
      useWorkspace.getState().movePath(v.from, v.to)
      toast.info(`renamed ${basename(v.from)} → ${basename(v.to)}`)
      invalidate()
    },
    onError,
  })

  const deletePath = useMutation({
    mutationFn: (v: { path: string }) => postJson<void>("/delete-path", v),
    onSuccess: (_, v) => {
      useWorkspace.getState().removePath(v.path)
      toast.info(`deleted ${basename(v.path)}`)
      invalidate()
    },
    onError,
  })

  const renameSymbol = useMutation({
    mutationFn: (v: { file: string, name: string, newName: string }) => postJson<void>("/rename-symbol", v),
    onSuccess: (_, v) => {
      useWorkspace.getState().renameSymbol(v.file, v.name, v.newName)
      toast.info(`renamed ${v.name} → ${v.newName}`)
      invalidate()
    },
    onError,
  })

  const runFile = useMutation({
    mutationFn: (v: { file: string }) => postJson<RunResult>("/run-file", v),
    onError,
  })

  return { renamePath, deletePath, renameSymbol, runFile }
}
