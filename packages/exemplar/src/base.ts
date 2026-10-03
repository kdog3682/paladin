/*
shared machinery behind runExampleFiles and runTest: import an examples file,
call every exported example, serialize, diff against the stored baseline.

baselines are always written, except a changed output, which only replaces
the baseline when `update` is set. pictures are always rendered for the
current output so the frontend can see it; the baseline's picture is kept
alongside an unaccepted change. any other picture in the dir is pruned.
*/
import { type SymbolInfo, loadSpecFunction, quickParse } from "@paladin/utils"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { picturePath, prunePictures, readBaseline, snapshotDir, writeBaseline } from "./snapshots"

/* "src/manim/display.ts#display" | "@a/b/display#display" */
export type Spec = string

/* how this run's output compares to the stored baseline */
export type Status = "new" | "match" | "changed" | "error"

export type ExampleItem = {
  /* serialized result of calling the example */
  output: string
  /* the exported symbol's name */
  name: string
  /* source text of the example itself */
  input: string
  /* the example's docstring */
  desc: string
  /* baseline output, absent on first run */
  previous?: string
  status: Status
  /* stack or message when the example threw; output is "" in that case */
  error?: string
  /* picture of the current output, null when none was rendered */
  artifactPath: string | null
  /* picture of the baseline output, set only for a changed item */
  previousArtifactPath?: string | null
  /* stack or message when display() threw */
  displayError?: string
}

export type ExampleFile = {
  /* path relative to the package root — display label and react key */
  relpath: string
  /* in source order */
  items: ExampleItem[]
}

export type ExampleReport = {
  namespace: string
  root: string
  files: ExampleFile[]
}

/* what display() receives — same item, plus the live unserialized value */
export type DisplayItem = ExampleItem & { value: unknown }

export type Serialize = (value: unknown) => string | Promise<string>

/* writes a picture of the item to outPath */
export type Display = (item: DisplayItem, outPath: string) => void | Promise<void>

export type Hooks = {
  /* overrides the namespace's `serialize` hook */
  serialize?: Spec
  /* overrides the namespace's `display` hook */
  display?: Spec
}

export type RunContext = {
  getRelpath: (path: string) => string
  serialize: Serialize
  display: Display | null
  /* accept changed output as the new baseline */
  update: boolean
}

const defaultSerialize: Serialize = (value) => JSON.stringify(value, null, 2)

const describe = (cause: unknown) =>
  cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)

/* a package with no importable entry just has no hooks, but an entry that exists and fails
   to import (e.g. a dangling re-export) must stop the run, not silently fall back to defaults */
async function importNamespace(namespace: string, root: string): Promise<any> {
  const entry = join(root, "src/index.ts")
  try {
    return await import(namespace)
  } catch {
    if (!existsSync(entry)) return {}
    try {
      return await import(pathToFileURL(entry).href)
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause)
      throw new Error(`cannot import package "${namespace}" (${entry}): ${reason}`, { cause })
    }
  }
}

export async function resolveHooks(namespace: string, root: string, hooks: Hooks) {
  const fallback: any = hooks.serialize && hooks.display ? {} : await importNamespace(namespace, root)
  const serialize: Serialize = hooks.serialize
    ? ((await loadSpecFunction(hooks.serialize, { root })) as Serialize)
    : (fallback.serialize ?? defaultSerialize)
  const display: Display | null = hooks.display
    ? ((await loadSpecFunction(hooks.display, { root })) as Display)
    : (fallback.display ?? null)
  return { serialize, display }
}

const KINDS = new Set(["function", "class"])

/* quickParse returns every symbol, so narrow to exported callables ourselves */
export function exampleSymbols(path: string): SymbolInfo[] {
  const { symbols } = quickParse(readFileSync(path, "utf8"))
  return symbols.filter((symbol) => symbol.exported && KINDS.has(symbol.kind))
}

async function runItem(module: any, name: string, serialize: Serialize) {
  try {
    const value = await module[name]()
    return { value, output: await serialize(value), error: undefined as string | undefined }
  } catch (cause) {
    return { value: undefined, output: "", error: describe(cause) }
  }
}

function statusOf(error: string | undefined, output: string, previous: string | undefined): Status {
  if (error) return "error"
  if (previous === undefined) return "new"
  return previous === output ? "match" : "changed"
}

/* the baseline after this run: errors and unaccepted changes keep the old one */
function nextBaseline(status: Status, output: string, previous: string | undefined, update: boolean) {
  if (status === "error" || (status === "changed" && !update)) return previous
  return output
}

/* reuses the picture for this output, or renders it */
async function renderItem(path: string, item: DisplayItem, display: Display) {
  const outPath = picturePath(path, item.name, item.output)
  if (!existsSync(outPath)) await display(item, outPath)
  return existsSync(outPath) ? outPath : null
}

export async function runFile(path: string, context: RunContext): Promise<ExampleFile> {
  const { getRelpath, serialize, display, update } = context
  const module = await import(path)
  const baseline = readBaseline(path)
  const next: Record<string, string> = {}
  const keep = new Set<string>()
  if (display) mkdirSync(snapshotDir(path), { recursive: true })

  const items: ExampleItem[] = []

  for (const symbol of exampleSymbols(path)) {
    const previous = baseline[symbol.name]
    const { value, output, error } = await runItem(module, symbol.name, serialize)
    const status = statusOf(error, output, previous)

    const accepted = nextBaseline(status, output, previous, update)
    if (accepted !== undefined) {
      next[symbol.name] = accepted
      keep.add(picturePath(path, symbol.name, accepted))
    }

    const item: ExampleItem = {
      output,
      name: symbol.name,
      input: symbol.text,
      desc: symbol.docstr ?? "",
      previous,
      status,
      error,
      artifactPath: null,
    }

    if (!error && display) {
      try {
        item.artifactPath = await renderItem(path, { ...item, value }, display)
        if (item.artifactPath) keep.add(item.artifactPath)
      } catch (cause) {
        item.displayError = describe(cause)
      }
    }

    if (status === "changed" && previous !== undefined) {
      const previousPath = picturePath(path, symbol.name, previous)
      item.previousArtifactPath = existsSync(previousPath) ? previousPath : null
    }

    items.push(item)
  }

  writeBaseline(path, next)
  if (display) prunePictures(path, keep)

  return { relpath: getRelpath(path), items }
}
