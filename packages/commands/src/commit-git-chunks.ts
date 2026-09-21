#!/usr/bin/env bun

import { existsSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { basename, join, posix, resolve } from "node:path"
import { $ } from "bun"
import {
  ReportBuilder,
  argParseRunner,
  collectExports,
  collectImports,
  commitPaths,
  existsAtHead,
  getStatus,
  isGitRepo,
  type GitStatusEntry,
} from "@paladin/utils"

export type CommitType = "feat" | "fix" | "refactor" | "deprecate" | "chore"

export type ParseGitChunksOpts = {
  /* print the plan without committing */
  dry?: boolean
}

/* commit order, and the set of valid types */
const TYPE_ORDER: CommitType[] = ["feat", "deprecate", "refactor", "fix", "chore"]

/* package-relative source roots, each child dir or file is its own unit */
const SRC_DIRS = ["src", "lib"]

const SOURCE_RE = /\.(c|m)?[jt]sx?$/
const TEST_RE = /(^|\/)(__tests__|tests?)\/|\.(test|spec)\.[^/]+$/
const LOCKFILES = new Set(["bun.lock", "bun.lockb", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"])
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]

/* generated dependency snapshots, they always move with the lockfile */
const DEP_SNAPSHOTS = new Set(["npm-dependencies.json", "bun-deps.json"])

/* src children that only namespace their contents, the real unit lives one level deeper */
const GENERIC_DIRS = new Set(["services", "lib", "libs", "modules", "common", "shared", "internal", "core", "helpers"])

/* files saved within this window of each other read as one logical change */
const MTIME_WINDOW_MS = 5 * 60 * 1000

/* shared code lines, as a fraction of the larger file, above which a delete + add reads as a move */
const MOVE_SIMILARITY = 0.5

/* how many names go into a commit subject before "+N more" */
const MAX_SUBJECT_EXPORTS = 8

/* above this many changed code lines an in-place edit reads as a refactor, not a fix */
const FIX_MAX_CHURN = 40

/* above this many edited source files an in-place edit reads as a refactor, not a fix */
const FIX_MAX_FILES = 3

const DECL_RE = /^export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|const|let|var|class|type|interface|enum|namespace)\s+([A-Za-z_$][\w$]*)/
const DEPRECATED_RE = /@deprecated\b(?:(?!\*\/)[\s\S])*\*\/\s*export\s+(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g

type GroupKind = "unit" | "barrel" | "docs" | "deps" | "misc"

type Group = {
  kind: GroupKind
  /* package dir relative to the repo root, "" for the root */
  pkgDir: string
  /* short package name used as the commit scope, ie txflow */
  pkg: string
  /* unit name for kind "unit", ie grammar for src/grammar/ or src/grammar.ts */
  unit?: string
  /* repo-relative unit dir or file, set once a non-test entry is seen */
  unitPath?: string
  entries: GitStatusEntry[]
}

type Chunk = {
  type: CommitType
  /* ie txflow/grammar */
  scope: string
  /* subject text after the scope */
  summary: string
  /* extra detail lines for the commit body */
  body: string[]
  group: Group
  sha?: string
  error?: string
}

type Surface = {
  before: Set<string>
  after: Set<string>
  /* names that are type-only on either side */
  typeNames: Set<string>
  /* export name -> declaration text, used to spot edited exports */
  segBefore: Map<string, string>
  segAfter: Map<string, string>
  deprBefore: Set<string>
  deprAfter: Set<string>
  /* any source file exists in HEAD */
  anyBefore: boolean
  /* any source file exists in the working tree */
  anyAfter: boolean
  /* files were created, deleted or renamed */
  reshaped: boolean
  /* every source file is a rename with identical content */
  pureMove: boolean
  /* source files present on both sides whose content changed */
  edited: number
  /* code lines added across edited files, comments and blank lines ignored */
  linesAdded: number
  /* code lines removed across edited files, comments and blank lines ignored */
  linesRemoved: number
  /* every edit only touched comments or whitespace */
  cosmetic: boolean
  /* every edit only touched whitespace */
  formatOnly: boolean
}

type Ctx = {
  root: string
  head: Map<string, Promise<string | undefined>>
  pkgCache: Map<string, string>
}

function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : path
}

function readText(path: string): string | undefined {
  try {
    return statSync(path).isFile() ? readFileSync(path, "utf8") : undefined
  } catch {
    return undefined
  }
}

/* file content at HEAD, undefined when it is not tracked there (or there is no HEAD yet) */
function readHead(ctx: Ctx, path: string): Promise<string | undefined> {
  let hit = ctx.head.get(path)
  if (!hit) {
    const spec = `HEAD:${path}`
    hit = $`git -C ${ctx.root} show ${spec}`.quiet().nothrow().then((r) => (r.exitCode === 0 ? r.text() : undefined))
    ctx.head.set(path, hit)
  }
  return hit
}

function entryPaths(entry: GitStatusEntry): string[] {
  return entry.origPath ? [entry.path, entry.origPath] : [entry.path]
}

function stemOf(name: string): string {
  return name.replace(/(\.(test|spec|d))?\.[^.]+$/, "")
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/* untracked dirs show up as "dir/", expand them to their files */
async function expandDirs(root: string, entries: GitStatusEntry[]): Promise<GitStatusEntry[]> {
  const out: GitStatusEntry[] = []
  for (const entry of entries) {
    if (!entry.path.endsWith("/")) {
      out.push(entry)
      continue
    }
    const r = await $`git -C ${root} ls-files -o --exclude-standard -z -- ${entry.path}`.quiet().nothrow()
    const files = r.exitCode === 0 ? r.text().split("\0").filter(Boolean) : []
    if (!files.length) out.push(entry)
    for (const path of files) out.push({ ...entry, path })
  }
  return out
}

/* fraction of code lines two versions share, 1 when they are the same file */
function similarity(before: string, after: string): number {
  const count = (text: string) => stripComments(text).split("\n").filter((l) => l.trim()).length
  const total = Math.max(count(before), count(after))
  if (!total) return 0
  const churn = lineChurn(before, after)
  return Math.max(0, total - Math.max(churn.added, churn.removed)) / total
}

/*
 * git only reports a rename when both sides are staged, so an unstaged move shows up as a delete
 * plus an untracked file. pair those back up (same basename, or near identical content) and hand
 * back one renamed entry, which keeps both halves of the move inside the same chunk.
 */
async function detectMoves(ctx: Ctx, entries: GitStatusEntry[]): Promise<GitStatusEntry[]> {
  const gone = entries.filter((e) => e.kind === "deleted" && SOURCE_RE.test(e.path))
  const born = entries.filter((e) => e.kind === "untracked" && SOURCE_RE.test(e.path))
  if (!gone.length || !born.length) return entries

  const moved = new Map<GitStatusEntry, GitStatusEntry>()
  const taken = new Set<GitStatusEntry>()
  for (const old of gone) {
    const before = await readHead(ctx, old.path)
    if (before === undefined) continue
    let best: GitStatusEntry | undefined
    let bestScore = 0
    for (const now of born) {
      if (taken.has(now)) continue
      const after = readText(join(ctx.root, now.path))
      if (after === undefined) continue
      // a matching basename is enough on its own, otherwise the content has to carry the match
      const bonus = posix.basename(now.path) === posix.basename(old.path) ? 1 : 0
      const score = similarity(before, after) + bonus
      if (score > bestScore) {
        best = now
        bestScore = score
      }
    }
    if (!best || bestScore < MOVE_SIMILARITY) continue
    taken.add(best)
    moved.set(best, old)
  }
  if (!moved.size) return entries

  const dropped = new Set(moved.values())
  return entries
    .filter((e) => !dropped.has(e))
    .map((e) => (moved.has(e) ? { path: e.path, origPath: moved.get(e)!.path, kind: "renamed" as const } : e))
}

function mtimeOf(ctx: Ctx, entry: GitStatusEntry): number | undefined {
  try {
    return statSync(join(ctx.root, entry.path)).mtimeMs
  } catch {
    return undefined
  }
}

/* oldest and newest save time across a group, undefined when every file is gone */
function mtimeRange(ctx: Ctx, entries: GitStatusEntry[]): { min: number, max: number } | undefined {
  const times = entries.map((e) => mtimeOf(ctx, e)).filter((t): t is number => t !== undefined)
  if (!times.length) return undefined
  return { min: Math.min(...times), max: Math.max(...times) }
}

/* gap in ms between two save windows, 0 when they overlap */
function mtimeGap(a?: { min: number, max: number }, b?: { min: number, max: number }): number {
  if (!a || !b) return Infinity
  return Math.max(0, a.min - b.max, b.min - a.max)
}

/* nearest dir (repo-relative) above path that has a package.json, "" for the root */
function findPackageDir(root: string, path: string, cache: Map<string, string>): string {
  const seen: string[] = []
  const remember = (value: string) => {
    for (const d of seen) cache.set(d, value)
    return value
  }
  for (let dir = posix.dirname(path); dir !== "." && dir !== "/"; dir = posix.dirname(dir)) {
    const hit = cache.get(dir)
    if (hit !== undefined) return remember(hit)
    seen.push(dir)
    if (existsSync(join(root, dir, "package.json"))) return remember(dir)
  }
  return remember("")
}

/* where a package-relative path belongs */
function bucketOf(rel: string): { kind: GroupKind, unit?: string, unitPath?: string } {
  const parts = rel.split("/")
  const name = parts[parts.length - 1]
  const isTest = TEST_RE.test(rel)

  if (/\.mdx?$/i.test(name) || parts[0] === "docs") return { kind: "docs" }
  if (rel === "package.json" || LOCKFILES.has(name) || DEP_SNAPSHOTS.has(name)) return { kind: "deps" }

  if (SRC_DIRS.includes(parts[0]) && parts.length > 1) {
    if (parts.length > 2) {
      // walk past namespace dirs, ie src/services/scaffold/deps.ts is the scaffold unit, not services
      let at = 1
      while (GENERIC_DIRS.has(parts[at]) && at + 2 < parts.length) at++
      return { kind: "unit", unit: parts[at], unitPath: parts.slice(0, at + 1).join("/") }
    }
    const stem = stemOf(name)
    if (stem === "index" && !isTest) return { kind: "barrel", unitPath: rel }
    return { kind: "unit", unit: stem, unitPath: isTest ? undefined : rel }
  }

  if (isTest) {
    const stem = stemOf(name)
    return { kind: "unit", unit: stem === "index" && parts.length > 1 ? parts[parts.length - 2] : stem }
  }

  return { kind: "misc" }
}

/* export name -> its declaration text, trailing comments belong to the next export */
function exportSegments(text: string): Map<string, string> {
  const segs = new Map<string, string>()
  let name: string | undefined
  let buf: string[] = []
  const flush = () => {
    while (buf.length && /^\s*(\/\*|\*|\/\/|$)/.test(buf[buf.length - 1])) buf.pop()
    if (name) segs.set(name, buf.join("\n").trim())
  }
  for (const line of text.split("\n")) {
    if (/^export\s/.test(line)) {
      flush()
      name = line.match(DECL_RE)?.[1]
      buf = []
    }
    buf.push(line)
  }
  flush()
  return segs
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\"'`])\/\/.*$/gm, "$1")
}

/* code with comments, whitespace, semicolons and trailing commas removed */
function compact(code: string): string {
  return stripComments(code).replace(/,(\s*[\]})])/g, "$1").replace(/[\s;]+/g, "")
}

/* the declaration part of an export segment, ie name + params + return type, without the body */
function headerOf(seg: string): string {
  const c = compact(seg)
  const paren = c.indexOf("(")
  const eq = c.indexOf("=")
  const brace = c.indexOf("{", Math.max(paren, 0))
  let cut = c.length
  if (paren >= 0 && brace > paren) cut = brace
  else if (brace >= 0 && (eq < 0 || brace < eq)) cut = brace
  else if (eq >= 0) cut = eq
  return c.slice(0, cut)
}

/* code lines added and removed between two versions, ignoring comments, blanks and order */
function lineChurn(before: string, after: string): { added: number, removed: number } {
  const lines = (text: string) => stripComments(text).split("\n").map((l) => l.trim().replace(/[;,]$/, "")).filter(Boolean)
  const pool = new Map<string, number>()
  for (const line of lines(before)) pool.set(line, (pool.get(line) ?? 0) + 1)
  let added = 0
  for (const line of lines(after)) {
    const n = pool.get(line) ?? 0
    if (n) pool.set(line, n - 1)
    else added++
  }
  let removed = 0
  for (const n of pool.values()) removed += n
  return { added, removed }
}

function deprecatedNames(text: string): string[] {
  return [...text.matchAll(DEPRECATED_RE)].map((m) => m[1])
}

function absorb(text: string, names: Set<string>, segs: Map<string, string>, depr: Set<string>, typeNames: Set<string>) {
  for (const e of collectExports(text)) {
    if (e.name === "*" || e.name === "default") continue
    names.add(e.name)
    if (e.isType) typeNames.add(e.name)
  }
  for (const [name, seg] of exportSegments(text)) segs.set(name, seg)
  for (const name of deprecatedNames(text)) depr.add(name)
}

/* export surface of a group before and after, public files (index or <unit>.ts) win when present */
async function surfaceOf(ctx: Ctx, group: Group): Promise<Surface> {
  const files = group.entries.filter((e) => SOURCE_RE.test(e.path) && !TEST_RE.test(e.path))
  const isPublic = (path?: string) => {
    if (!path) return false
    const stem = stemOf(posix.basename(path))
    return stem === "index" || stem === group.unit
  }
  const pub = files.filter((e) => isPublic(e.path) || isPublic(e.origPath))
  const pick = new Set(pub.length ? pub : files)

  const s: Surface = {
    before: new Set(),
    after: new Set(),
    typeNames: new Set(),
    segBefore: new Map(),
    segAfter: new Map(),
    deprBefore: new Set(),
    deprAfter: new Set(),
    anyBefore: false,
    anyAfter: false,
    reshaped: false,
    pureMove: files.length > 0,
    edited: 0,
    linesAdded: 0,
    linesRemoved: 0,
    cosmetic: true,
    formatOnly: true,
  }

  for (const e of files) {
    const before = await readHead(ctx, e.origPath ?? e.path)
    const after = readText(join(ctx.root, e.path))
    s.anyBefore ||= before !== undefined
    s.anyAfter ||= after !== undefined
    if (e.origPath || (before === undefined) !== (after === undefined)) s.reshaped = true
    if (!e.origPath || before !== after) s.pureMove = false
    if (before !== undefined && after !== undefined && before !== after) {
      s.edited++
      const churn = lineChurn(before, after)
      s.linesAdded += churn.added
      s.linesRemoved += churn.removed
      if (compact(before) !== compact(after)) s.cosmetic = false
      if (before.replace(/\s+/g, "") !== after.replace(/\s+/g, "")) s.formatOnly = false
    }
    if (!pick.has(e)) continue
    if (before !== undefined) absorb(before, s.before, s.segBefore, s.deprBefore, s.typeNames)
    if (after !== undefined) absorb(after, s.after, s.segAfter, s.deprAfter, s.typeNames)
  }
  return s
}

function formatNames(names: string[]): string {
  const shown = names.slice(0, MAX_SUBJECT_EXPORTS).map((n) => `\`${n}\``)
  const extra = names.length - shown.length
  if (extra > 0) return `${shown.join(", ")} +${extra} more`
  if (shown.length < 2) return shown.join("")
  return `${shown.slice(0, -1).join(", ")} & ${shown[shown.length - 1]}`
}

function fileNames(entries: GitStatusEntry[]): string {
  return formatNames([...new Set(entries.map((e) => posix.basename(e.path)))])
}

/* the files a subject can usefully name, minus the one that only repeats the unit */
function touchedNames(group: Group): string {
  const names = [...new Set(group.entries.map((e) => posix.basename(e.path)))]
  const useful = names.filter((n) => stemOf(n) !== group.unit)
  return useful.length ? formatNames(useful) : ""
}

function detail(label: string, names: string[]): string | undefined {
  return names.length ? `${label}: ${names.join(", ")}` : undefined
}

/* package relative dir a path used to live in, ie src/fs */
function dirLabel(group: Group, path: string): string {
  const rel = group.pkgDir ? path.slice(group.pkgDir.length + 1) : path
  return posix.dirname(rel)
}

/*
 * pick the commit type for a src unit (or the barrel) from how its export surface moved.
 * when the surface is intact: comment / format only -> chore, signature change, reorder or
 * large rewrite -> refactor, small body edit -> fix
 */
async function classifyUnit(ctx: Ctx, group: Group): Promise<Chunk> {
  const scope = group.unit ? `${group.pkg}/${group.unit}` : group.pkg
  const label = group.unit ?? "index"
  const chunk = (type: CommitType, summary: string, body: (string | undefined)[] = []): Chunk => ({
    type,
    scope,
    summary,
    body: body.filter((b): b is string => !!b),
    group,
  })

  const sources = group.entries.filter((e) => !TEST_RE.test(e.path))
  if (!sources.length) return chunk("chore", `update tests for ${label}`)

  // a group made only of moved files is a move, whatever the files picked up on the way
  const moves = sources.filter((e) => e.origPath)
  if (moves.length && moves.length === sources.length) {
    const from = [...new Set(moves.map((e) => dirLabel(group, e.origPath!)))]
    return chunk("refactor", `move ${fileNames(moves)} from ${from.join(" and ")}`)
  }

  const s = await surfaceOf(ctx, group)
  if (s.pureMove) return chunk("refactor", `move ${fileNames(sources)}`)

  const existedBefore = group.unitPath ? await existsAtHead(ctx.root, group.unitPath) : s.anyBefore
  const existsNow = group.unitPath ? existsSync(join(ctx.root, group.unitPath)) : s.anyAfter

  const added = [...s.after].filter((n) => !s.before.has(n))
  const removed = [...s.before].filter((n) => !s.after.has(n))
  const changed = [...s.after].filter((n) => s.segBefore.has(n) && s.segAfter.has(n) && s.segBefore.get(n) !== s.segAfter.get(n))
  const deprecated = [...s.deprAfter].filter((n) => !s.deprBefore.has(n))
  const names = (list: string[]) => {
    const values = list.filter((n) => !s.typeNames.has(n))
    return formatNames(values.length ? values : list)
  }
  const body = [
    detail("added", added),
    detail("removed", removed),
    detail("changed", changed),
    detail("deprecated", deprecated),
  ]

  if (!existsNow) return chunk("deprecate", `remove ${names([...s.before]) || label}`, body)
  if (!existedBefore) return chunk("feat", `create ${names([...s.after]) || label}`, body)
  if (added.length) return chunk("feat", `add ${names(added)}`, body)
  if (deprecated.length) return chunk("deprecate", `deprecate ${formatNames(deprecated)}`, body)
  if (removed.length) return chunk("deprecate", `remove ${names(removed)}`, body)
  if (!changed.length && s.reshaped) return chunk("refactor", `restructure ${label}`, body)

  // exports intact from here on, infer fix / refactor / chore from the edits themselves
  // no named export moved, so fall back to the files, tests included: they are the change here
  const target = (list: string[]) => (list.length ? names(list) : touchedNames(group) || "internals")
  if (!s.edited) return chunk("fix", `update ${target([])}`, body)

  if (s.cosmetic) return chunk("chore", `${s.formatOnly ? "format" : "document"} ${target(changed)}`, body)

  const reworked = changed.filter((n) => compact(s.segBefore.get(n)!) !== compact(s.segAfter.get(n)!))
  const resigned = reworked.filter((n) => !s.typeNames.has(n) && headerOf(s.segBefore.get(n)!) !== headerOf(s.segAfter.get(n)!))
  if (resigned.length) return chunk("refactor", `change signature of ${names(resigned)}`, body)

  const churn = s.linesAdded + s.linesRemoved
  if (!churn) return chunk("refactor", `reorder ${target(reworked)}`, body)
  if (churn > FIX_MAX_CHURN || s.edited > FIX_MAX_FILES) return chunk("refactor", `rework ${target(reworked)}`, body)
  return chunk("fix", `patch ${target(reworked)}`, body)
}

function depsOf(text?: string): Map<string, string> {
  const out = new Map<string, string>()
  if (!text) return out
  try {
    const json = JSON.parse(text)
    for (const field of DEP_FIELDS) {
      for (const [name, version] of Object.entries(json[field] ?? {})) out.set(name, String(version))
    }
  } catch {}
  return out
}

/*
 * one commit for everything dependency shaped: every package.json the units did not claim, the
 * lockfile and the generated snapshots beside it, which never change on their own anyway.
 */
async function classifyDeps(ctx: Ctx, group: Group): Promise<Chunk> {
  const manifests = group.entries.filter((e) => posix.basename(e.path) === "package.json")
  const added = new Map<string, string>()
  const removed = new Set<string>()
  const bumped = new Map<string, string>()

  for (const manifest of manifests) {
    const before = depsOf(await readHead(ctx, manifest.origPath ?? manifest.path))
    const after = depsOf(readText(join(ctx.root, manifest.path)))
    for (const [name, version] of after) {
      if (!before.has(name)) added.set(name, version)
      else if (before.get(name) !== version) bumped.set(name, `${before.get(name)} -> ${version}`)
    }
    for (const name of before.keys()) if (!after.has(name)) removed.add(name)
  }

  const locked = group.entries.length > manifests.length
  const parts = [
    added.size ? `add ${formatNames([...added.keys()])}` : "",
    removed.size ? `remove ${formatNames([...removed])}` : "",
    bumped.size ? `bump ${formatNames([...bumped.keys()])}` : "",
    locked ? "update lockfile" : "",
  ].filter(Boolean)

  return {
    type: "chore",
    scope: "deps",
    summary: parts.length ? parts.join(", ") : "update package.json",
    body: [
      detail("added", [...added].map(([n, v]) => `${n}@${v}`)),
      detail("removed", [...removed]),
      detail("bumped", [...bumped].map(([n, move]) => `${n} ${move}`)),
    ].filter((b): b is string => !!b),
    group,
  }
}

/* dependency names a manifest gained, lost or re-versioned against HEAD */
async function changedDeps(ctx: Ctx, entry: GitStatusEntry): Promise<string[]> {
  const before = depsOf(await readHead(ctx, entry.origPath ?? entry.path))
  const after = depsOf(readText(join(ctx.root, entry.path)))
  return [...new Set([...before.keys(), ...after.keys()])].filter((n) => before.get(n) !== after.get(n))
}

/* the runtime package a dep entry is for, ie @types/node is about node */
function depTarget(name: string): string {
  const types = name.match(/^@types\/(.+)$/)
  if (!types) return name
  return types[1].includes("__") ? `@${types[1].replace("__", "/")}` : types[1]
}

/* bare packages a chunk's sources import, on both sides of the change so a removed import counts */
async function importedPackages(ctx: Ctx, chunk: Chunk): Promise<Set<string>> {
  const names = new Set<string>()
  for (const entry of chunk.group.entries) {
    if (!SOURCE_RE.test(entry.path)) continue
    const texts = [readText(join(ctx.root, entry.path)), await readHead(ctx, entry.origPath ?? entry.path)]
    for (const text of texts) {
      for (const imp of collectImports(text ?? "")) if (imp.type !== "local") names.add(imp.source)
    }
  }
  return names
}

/*
 * a manifest change exists because some code needed it. hand each package.json to the one chunk
 * in its package that imports every dep it touched, then the lockfile and snapshots (which only
 * ever move with a manifest) follow when every changed manifest found the same owner. anything
 * unclaimed stays in the deps group for the shared chore(deps) commit.
 */
async function claimDeps(ctx: Ctx, chunks: Chunk[], groups: Group[]) {
  const manifests = groups.flatMap((g) => g.entries.filter((e) => posix.basename(e.path) === "package.json"))
  const trailing = groups.flatMap((g) => g.entries.filter((e) => posix.basename(e.path) !== "package.json"))
  if (!manifests.length) return

  const imports = new Map<Chunk, Set<string>>()
  const owners = new Map<GitStatusEntry, Chunk>()
  for (const manifest of manifests) {
    const pkgDir = posix.dirname(manifest.path) === "." ? "" : posix.dirname(manifest.path)
    const names = (await changedDeps(ctx, manifest)).map(depTarget)
    if (!names.length) continue
    let owner: Chunk | undefined
    let ambiguous = false
    for (const chunk of chunks.filter((c) => c.group.pkgDir === pkgDir)) {
      let seen = imports.get(chunk)
      if (!seen) imports.set(chunk, (seen = await importedPackages(ctx, chunk)))
      if (!names.every((n) => seen.has(n))) continue
      if (owner) ambiguous = true
      owner = chunk
    }
    if (owner && !ambiguous) owners.set(manifest, owner)
  }
  if (!owners.size) return

  const claim = (owner: Chunk, entry: GitStatusEntry) => {
    owner.group.entries.push(entry)
    for (const group of groups) group.entries = group.entries.filter((e) => e !== entry)
  }
  for (const [manifest, owner] of owners) {
    const info = await classifyDeps(ctx, { kind: "deps", pkgDir: "", pkg: "", entries: [manifest] })
    owner.body.push(...info.body.map((line) => `dep ${line}`))
    claim(owner, manifest)
  }

  const single = new Set(owners.values())
  if (owners.size === manifests.length && single.size === 1) for (const entry of trailing) claim([...single][0], entry)
}

/* the barrel on its own: say which modules it started and stopped re-exporting */
async function classifyBarrel(ctx: Ctx, group: Group): Promise<Chunk> {
  const entry = group.entries[0]
  const sourcesOf = (text?: string) =>
    new Set(collectImports(text ?? "").filter((i) => i.reexport && i.type === "local").map((i) => i.source))
  const before = sourcesOf(await readHead(ctx, entry.origPath ?? entry.path))
  const after = sourcesOf(readText(join(ctx.root, entry.path)))
  const wired = [...after].filter((s) => !before.has(s))
  const dropped = [...before].filter((s) => !after.has(s))
  if (!wired.length && !dropped.length) return classifyUnit(ctx, group)

  /* ./ast/collectImports and ./ast/collectExports are both the ast unit */
  const units = (list: string[]) => [...new Set(list.map((s) => s.replace(/^\.\//, "").split("/")[0]))]
  const on = units(wired)
  /* a unit that only changed file within the barrel is not a unit that went away */
  const off = units(dropped).filter((u) => !on.includes(u))
  const parts = [on.length ? `wire up ${formatNames(on)}` : "", off.length ? `drop ${formatNames(off)}` : ""].filter(Boolean)

  return {
    type: "refactor",
    scope: group.pkg,
    summary: `${parts.join(", ")} in the barrel`,
    body: [detail("exports added", wired), detail("exports removed", dropped)].filter((b): b is string => !!b),
    group,
  }
}

/* lines that differ between HEAD and the working tree */
async function changedLines(ctx: Ctx, entry: GitStatusEntry): Promise<string[]> {
  const before = ((await readHead(ctx, entry.origPath ?? entry.path)) ?? "").split("\n")
  const after = (readText(join(ctx.root, entry.path)) ?? "").split("\n")
  const a = new Set(before)
  const b = new Set(after)
  return [...before.filter((l) => !b.has(l)), ...after.filter((l) => !a.has(l))]
}

/* docs, odds and ends and test only units: nothing that stands as a commit by itself */
function isLoose(group: Group): boolean {
  if (group.kind === "docs" || group.kind === "misc") return true
  return group.kind === "unit" && group.entries.every((e) => TEST_RE.test(e.path))
}

/*
 * fold a loose group into the work it was saved alongside, but only when one neighbour in the
 * package is close enough in time to be unambiguous, ie a doc touched while editing one module.
 */
function mergeLoose(ctx: Ctx, groups: Map<string, Group>) {
  const all = [...groups.entries()]
  for (const [key, group] of all) {
    if (!isLoose(group)) continue
    const here = mtimeRange(ctx, group.entries)
    const near = all
      .map(([, g]) => g)
      .filter((g) => g !== group && !isLoose(g) && g.pkgDir === group.pkgDir)
      .filter((g) => mtimeGap(here, mtimeRange(ctx, g.entries)) <= MTIME_WINDOW_MS)
    if (near.length !== 1) continue
    near[0].entries.push(...group.entries)
    groups.delete(key)
  }
}

/* module path a specifier points at, extensions and /index stripped, so both sides compare equal */
function modulePath(path: string): string {
  return posix.normalize(path).replace(SOURCE_RE, "").replace(/\/index$/, "")
}

function resolveLocal(from: string, spec: string): string {
  return modulePath(posix.join(posix.dirname(from), spec))
}

/*
 * order the commits so a chunk lands after everything it imports from this same run: the modules
 * it pulls in by path, and, for a workspace import, the package barrel plus whoever declares the
 * names it asks for. type order and save time decide the rest.
 */
function orderChunks(ctx: Ctx, chunks: Chunk[]): Chunk[] {
  const byModule = new Map<string, Chunk>()
  const byName = new Map<string, Chunk[]>()
  const barrels = new Map<string, Chunk>()
  const pkgName = (pkgDir: string) => {
    const text = readText(join(ctx.root, pkgDir, "package.json"))
    try {
      return text ? String(JSON.parse(text).name ?? "") : ""
    } catch {
      return ""
    }
  }

  const sourcesOf = (chunk: Chunk) =>
    chunk.group.entries.filter((e) => SOURCE_RE.test(e.path) && !TEST_RE.test(e.path))

  for (const chunk of chunks) {
    for (const entry of sourcesOf(chunk)) {
      const text = readText(join(ctx.root, entry.path))
      if (text === undefined) continue
      byModule.set(modulePath(entry.path), chunk)
      for (const e of collectExports(text)) {
        if (e.name === "*" || e.name === "default") continue
        byName.set(e.name, [...(byName.get(e.name) ?? []), chunk])
      }
    }
    if (chunk.group.kind === "barrel") barrels.set(chunk.group.pkgDir, chunk)
  }

  const pkgBarrel = new Map<string, Chunk>()
  for (const [pkgDir, chunk] of barrels) {
    const name = pkgName(pkgDir)
    if (name) pkgBarrel.set(name, chunk)
  }

  const needs = new Map<Chunk, Set<Chunk>>()
  for (const chunk of chunks) {
    const deps = new Set<Chunk>()
    for (const entry of chunk.group.entries) {
      const text = readText(join(ctx.root, entry.path))
      if (text === undefined || !SOURCE_RE.test(entry.path)) continue
      for (const imp of collectImports(text)) {
        if (imp.type === "local") {
          const hit = byModule.get(resolveLocal(entry.path, imp.source))
          if (hit && hit !== chunk) deps.add(hit)
          continue
        }
        if (imp.type !== "workspace") continue
        const barrel = pkgBarrel.get(imp.source)
        if (barrel && barrel !== chunk) deps.add(barrel)
        for (const binding of imp.bindings) {
          for (const owner of byName.get(binding.imported) ?? []) if (owner !== chunk) deps.add(owner)
        }
      }
    }
    needs.set(chunk, deps)
  }

  const rank = (chunk: Chunk) => (chunk.scope === "deps" ? TYPE_ORDER.length : TYPE_ORDER.indexOf(chunk.type))
  const age = (chunk: Chunk) => mtimeRange(ctx, chunk.group.entries)?.min ?? Infinity
  const base = [...chunks].sort((a, b) => rank(a) - rank(b) || age(a) - age(b) || a.scope.localeCompare(b.scope))

  /* depth first over the base order, so a dependency is emitted just before whoever needs it */
  const out: Chunk[] = []
  const state = new Map<Chunk, "open" | "done">()
  const visit = (chunk: Chunk) => {
    if (state.has(chunk)) return
    state.set(chunk, "open")
    for (const dep of needs.get(chunk) ?? []) if (state.get(dep) !== "open") visit(dep)
    state.set(chunk, "done")
    out.push(chunk)
  }
  for (const chunk of base) visit(chunk)
  return out
}

async function planChunks(ctx: Ctx, entries: GitStatusEntry[]): Promise<Chunk[]> {
  const groups = new Map<string, Group>()

  for (const entry of entries) {
    const pkgDir = findPackageDir(ctx.root, entry.path, ctx.pkgCache)
    const rel = pkgDir ? entry.path.slice(pkgDir.length + 1) : entry.path
    const b = bucketOf(rel)
    const key = [pkgDir, b.kind, b.unit ?? ""].join("\0")
    let group = groups.get(key)
    if (!group) {
      group = { kind: b.kind, pkgDir, pkg: basename(pkgDir || ctx.root), unit: b.unit, entries: [] }
      groups.set(key, group)
    }
    if (b.unitPath && !group.unitPath) group.unitPath = posix.join(pkgDir, b.unitPath)
    group.entries.push(entry)
  }

  mergeLoose(ctx, groups)

  const chunks: Chunk[] = []
  for (const group of groups.values()) {
    if (group.kind === "unit") chunks.push(await classifyUnit(ctx, group))
  }

  // the barrel and package.json ride along with the commit they wire up, but only when it is the
  // one commit they name: a barrel touching several units has to wait for all of them instead
  const importRe = (unit: string) => new RegExp(`from\\s*["'][^"']*\\b${escapeRe(unit)}\\b`)
  for (const group of groups.values()) {
    if (group.kind !== "barrel") continue
    const units = chunks.filter((c) => c.group.pkgDir === group.pkgDir && c.group.unit)
    if (!units.length) continue
    const keep: GitStatusEntry[] = []
    for (const entry of group.entries) {
      const lines = await changedLines(ctx, entry)
      const owners = units.filter((c) => lines.some((l) => importRe(c.group.unit!).test(l)))
      const owner = owners.length === 1 && (owners[0].type === "feat" || owners[0].type === "deprecate") ? owners[0] : undefined
      if (owner) owner.group.entries.push(entry)
      else keep.push(entry)
    }
    group.entries = keep
  }

  await claimDeps(ctx, chunks, [...groups.values()].filter((g) => g.kind === "deps"))

  // every leftover package.json, lockfile and dependency snapshot is one deps commit for the repo
  const deps: Group[] = []
  for (const group of groups.values()) {
    if (group.kind === "unit" || !group.entries.length) continue
    if (group.kind === "barrel") chunks.push(await classifyBarrel(ctx, group))
    else if (group.kind === "deps") deps.push(group)
    else {
      chunks.push({
        type: "chore",
        scope: group.kind === "docs" ? `${group.pkg}/docs` : group.pkg,
        summary: `update ${fileNames(group.entries)}`,
        body: [],
        group,
      })
    }
  }
  if (deps.length) {
    const merged: Group = { kind: "deps", pkgDir: "", pkg: basename(ctx.root), entries: deps.flatMap((g) => g.entries) }
    chunks.push(await classifyDeps(ctx, merged))
  }

  return orderChunks(ctx, chunks)
}

function subjectOf(chunk: Chunk): string {
  return `${chunk.type}(${chunk.scope}): ${chunk.summary}`
}

function messageOf(chunk: Chunk): string {
  return chunk.body.length ? `${subjectOf(chunk)}\n\n${chunk.body.join("\n")}` : subjectOf(chunk)
}

function clock(ms: number): string {
  return new Date(ms).toTimeString().slice(0, 8)
}

function entryLine(e: GitStatusEntry): string {
  return `${e.kind.padEnd(9)} ${e.origPath ? `${e.origPath} -> ` : ""}${e.path}`
}

/* split working tree changes into feat / fix / refactor / deprecate / chore commits per package unit */
export async function parseGitChunks(dir: string, opts: ParseGitChunksOpts = {}): Promise<ReportBuilder> {
  const root = resolve(expandHome(dir))
  const report = new ReportBuilder(`commit-git-chunks${opts.dry ? " (dry run)" : ""}`)
  report.kv("repo", root)

  if (!isGitRepo(root)) return report.error(`not a git repo (no .git in ${root})`)

  const status = (await getStatus(root)).filter((e) => e.kind !== "ignored")
  const unmerged = status.filter((e) => e.kind === "unmerged")
  if (unmerged.length) {
    return report.error("unmerged paths, resolve them first").indent((r) => r.list(unmerged.map((e) => e.path)))
  }
  if (!status.length) return report.ok("working tree clean, nothing to commit")

  const ctx: Ctx = { root, head: new Map(), pkgCache: new Map() }
  const all = await detectMoves(ctx, await expandDirs(root, status))
  const chunks = await planChunks(ctx, all)
  report.kv("changed", all.length).kv("chunks", chunks.length).blank()

  for (const chunk of chunks) {
    if (!opts.dry) {
      try {
        chunk.sha = await commitPaths(root, messageOf(chunk), [...new Set(chunk.group.entries.flatMap(entryPaths))])
      } catch (err) {
        chunk.error = err instanceof Error ? err.message : String(err)
      }
    }

    const tag = chunk.error ? "FAILED" : chunk.sha ?? "planned"
    report.line(`${tag.padEnd(7)} ${subjectOf(chunk)}`)
    report.indent((r) => {
      for (const line of chunk.body) r.line(line)
      const span = opts.dry ? mtimeRange(ctx, chunk.group.entries) : undefined
      if (span) r.line(`saved ${clock(span.min)}${span.max - span.min > 1000 ? ` .. ${clock(span.max)}` : ""}`)
      r.list(chunk.group.entries.map(entryLine), "·")
      if (chunk.error) r.error(chunk.error)
    })
    report.blank()
  }

  const done = chunks.filter((c) => c.sha).length
  const failed = chunks.filter((c) => c.error).length
  if (opts.dry) report.line(`${chunks.length} commit(s) planned`)
  else if (failed) report.error(`${done} committed, ${failed} failed`)
  else report.ok(`${done} commit(s) created`)
  return report
}

if (import.meta.main) {
  argParseRunner(parseGitChunks, {
    abstract: "split working tree changes into feat / fix / refactor / deprecate / chore commits per package unit",
    args: [{ name: "dir", help: "git repo root", fallback: "~/projects/mathpen" }],
    kwargs: [{ name: "dry", alias: "n", help: "print the plan without committing", default: false }],
  })
}
