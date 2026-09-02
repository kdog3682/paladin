/*
shared machinery behind runExampleFiles and runTest.

both do the same work — import an examples file, call every exported example,
serialize the result, diff it against the stored snapshot. they differ only in
what happens afterwards: runExampleFiles renders through the namespace's
display hook and may rewrite the baseline, runTest does neither and only
reports mismatches.
*/
import { type SymbolInfo, createCache, loadSpecFunction, quickParse } from "@paladin/utils"
import { join } from "node:path"

/* "src/manim/display.ts#display" | "@a/b/display#display" */
export type Spec = string

/* how this run's output compares to the stored snapshot */
export type Status = "new" | "match" | "changed" | "error"

export type ExampleItem = {
  /* serialized result of calling the example */
  output: string
  /* the exported symbol's name */
  name: string
  /* the input seed — source text of the example itself */
  input: string
  /* the example's docstring, read as a statement about what it should do */
  desc: string
  /* snapshot output from a previous run, absent on first run */
  previous?: string
  status: Status
  /* wall time of the call plus serialization */
  ms: number
  /* stack or message when the example threw; output is "" in that case */
  error?: string
}


export type ExampleFile = {
  /* path relative to root — display label and stable react key */
  relpath: string
  /* whatever display() wrote, if anything */
  artifactPath: string | null
  /* in source order */
  items: ExampleItem[]
}

export type ExampleReport = {
  namespace: string
  root: string
  files: ExampleFile[]
  /* item counts across every file, for a header badge */
  summary: Record<Status, number>
}

/* what display() receives — same item, plus the live unserialized value */
export type DisplayItem = ExampleItem & { value: unknown }

export type DisplayContext = { path: string; relpath: string; namespace: string; root: string }

export type Serialize = (value: unknown) => string | Promise<string>
export type Display = (
  items: DisplayItem[],
  context: DisplayContext,
) => string | null | Promise<string | null>

export type Hooks = {
  /* overrides the namespace's `serialize` hook */
  serialize?: Spec
  /* overrides the namespace's `display` hook */
  display?: Spec
}

/* everything runFile needs that doesn't vary per file */
export type RunContext = {
  namespace: string
  root: string
  getRelpath: (path: string) => string
  serialize: Serialize
  display: Display | null
  /* accept changed output as the new baseline */
  update: boolean
  /* persist baselines at all — off for test runs */
  write: boolean
}

const defaultSerialize: Serialize = (value) => JSON.stringify(value, null, 2)

export async function resolveHooks(namespace: string, root: string, hooks: Hooks) {
  const fallback: any =
    hooks.serialize && hooks.display ? {} : await import(namespace).catch(() => ({}))
  const serialize: Serialize = hooks.serialize
    ? ((await loadSpecFunction(hooks.serialize, { root })) as Serialize)
    : (fallback.serialize ?? defaultSerialize)
  const display: Display | null = hooks.display
    ? ((await loadSpecFunction(hooks.display, { root })) as Display)
    : (fallback.display ?? null)
  return { serialize, display }
}

export function snapshotDir(root: string) {
  return join(root, "snapshots")
}

/* flat snapshot dir, so the whole relpath is flattened into the filename */
export function snapshotPath(root: string, relpath: string) {
  return join(snapshotDir(root), `${flatten(relpath)}.cache.json`)
}

export const flatten = (relpath: string) => relpath.replaceAll("/", "__")

export const unflatten = (filename: string) =>
  filename.replace(/\.cache\.json$/, "").replaceAll("__", "/")

const KINDS = new Set(["function", "class"])

/* quickParse returns every symbol, so narrow to exported callables ourselves */
export function exampleSymbols(path: string): SymbolInfo[] {
  const { symbols } = quickParse(path)
  return symbols.filter((symbol) => symbol.exported && KINDS.has(symbol.kind))
}

async function runItem(module: any, symbol: SymbolInfo, serialize: Serialize) {
  const started = performance.now()
  try {
    const value = await module[symbol.name]()
    const output = await serialize(value)
    return { value, output, ms: performance.now() - started, error: undefined as string | undefined }
  } catch (cause) {
    const error = cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)
    return { value: undefined, output: "", ms: performance.now() - started, error }
  }
}

function statusOf(error: string | undefined, output: string, previous: string | undefined): Status {
  if (error) return "error"
  if (previous === undefined) return "new"
  return previous === output ? "match" : "changed"
}

export async function runFile(path: string, context: RunContext): Promise<ExampleFile> {
  const { namespace, root, getRelpath, serialize, display, update, write } = context
  const relpath = getRelpath(path)
  const module = await import(path)
  const cache = createCache<string>(snapshotPath(root, relpath))

  const items: ExampleItem[] = []
  const shown: DisplayItem[] = []

  for (const symbol of exampleSymbols(path)) {
    const previous = await cache.get(symbol.name)
    const { value, output, ms, error } = await runItem(module, symbol, serialize)
    const status = statusOf(error, output, previous)

    if (write && (status === "new" || (status === "changed" && update))) {
      cache.set(symbol.name, output)
    }

    const item: ExampleItem = {
      output,
      name: symbol.name,
      input: symbol.text,
      desc: symbol.docstr ?? "",
      previous,
      status,
      ms,
      error,
    }
    items.push(item)
    if (!error) shown.push({ ...item, value })
  }

  const artifactPath =
    display && shown.length ? await display(shown, { path, relpath, namespace, root }) : null
  if (write) await cache.save()

  return { relpath, artifactPath, items }
}

export function emptySummary(): Record<Status, number> {
  return { new: 0, match: 0, changed: 0, error: 0 }
}

export function summarize(files: ExampleFile[]): Record<Status, number> {
  const summary = emptySummary()
  for (const file of files) for (const item of file.items) summary[item.status] += 1
  return summary
}
