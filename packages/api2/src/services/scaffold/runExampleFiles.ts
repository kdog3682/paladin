/*
runs `.examples.` files and records their output.
  runExampleFiles({ paths: ["/repo/a/packages/b/src/foo.examples.ts"] })
every example always runs; the snapshot is the baseline we compare against,
not a skip list. pass `update` to accept changed output as the new baseline.
*/
import {
  type SymbolInfo,
  createCache,
  deriveNamespace,
  loadSpecFunction,
  withArgv,
  quickParse,
} from "@paladin/utils"
import { join } from "node:path"

/* "src/manim/display.ts#display" | "@a/b/display#display" */
export type Spec = string

export type Options = {
  /* absolute paths to the .examples. files to run */
  paths: string[]
  /* overrides the namespace's `serialize` hook */
  serialize?: Spec
  /* overrides the namespace's `display` hook */
  display?: Spec
  /* accept changed output as the new snapshot baseline */
  update?: boolean
}

/* how this run's output compares to the stored snapshot */
export type Status = "new" | "match" | "changed" | "error"

export type ExampleItem = SymbolInfo & {
  /* serialized result of calling the example */
  output: string
  /* snapshot output from a previous run, absent on first run */
  previous?: string
  status: Status
  /* wall time of the call plus serialization */
  ms: number
  /* stack or message when the example threw; output is "" in that case */
  error?: string
}

/* what display() receives — same item, plus the live unserialized value */
export type DisplayItem = ExampleItem & { value: unknown }

export type DisplayContext = { path: string; relpath: string; namespace: string; root: string }

export type ExampleFile = {
  /* absolute path to the examples file */
  path: string
  /* path relative to root — display label and stable react key */
  relpath: string
  /* whatever display() wrote, if anything */
  artifactPath: string | null
  /* in source order */
  items: ExampleItem[]
}

export type ExampleRun = {
  namespace: string
  root: string
  files: ExampleFile[]
  /* item counts across every file, for a header badge */
  summary: Record<Status, number>
}

type Serialize = (value: unknown) => string | Promise<string>
type Display = (items: DisplayItem[], context: DisplayContext) => unknown

async function resolveHooks(namespace: string, root: string, options: Options) {
  const fallback: any =
    options.serialize && options.display ? {} : await import(namespace).catch(() => ({}))
  const serialize: Serialize = options.serialize
    ? ((await loadSpecFunction(options.serialize, { root })) as Serialize)
    : (fallback.serialize ?? ((v: unknown) => JSON.stringify(v, null, 2)))
  const display: Display | null = options.display
    ? ((await loadSpecFunction(options.display, { root })) as Display)
    : (fallback.display ?? null)
  return { serialize, display }
}

/* flat snapshot dir, so the whole relpath is flattened into the filename */
function snapshotPath(root: string, relpath: string) {
  return join(root, "snapshots", `${relpath.replaceAll("/", "__")}.cache.json`)
}

async function runItem(module: any, item: SymbolInfo, serialize: Serialize) {
  const started = performance.now()
  try {
    const value = await module[item.name]()
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

export async function runExampleFiles(options: Options): Promise<ExampleRun> {
  const { paths, update } = options
  const { namespace, root } = deriveNamespace(paths[0])
  const { serialize, display } = await resolveHooks(namespace, root, options)

  const files: ExampleFile[] = []
  const summary: Record<Status, number> = { new: 0, match: 0, changed: 0, error: 0 }

  for (const path of paths) {
    const relpath = path.slice(root.length + 1)
    const module = await import(path)
    const { symbols } = quickParse(path, { exported: true, kind: ["function", "class"] })
    const cache = createCache<string>(snapshotPath(root, relpath))

    const items: ExampleItem[] = []
    const shown: DisplayItem[] = []

    for (const symbol of symbols) {
      const previous = await cache.get(symbol.name)
      const { value, output, ms, error } = await runItem(module, symbol, serialize)
      const status = statusOf(error, output, previous)
      summary[status] += 1

      if (status === "new" || (status === "changed" && update)) cache.set(symbol.name, output)

      const item: ExampleItem = { ...symbol, output, previous, status, ms, error }
      items.push(item)
      if (!error) shown.push({ ...item, value })
    }

    const artifact =
      display && shown.length ? await display(shown, { path, relpath, namespace, root }) : null
    await cache.save()

    files.push({ path, relpath, artifactPath: typeof artifact === "string" ? artifact : null, items })
  }

  return { namespace, root, files, summary }
}

export default withArgv(runExampleFiles)
