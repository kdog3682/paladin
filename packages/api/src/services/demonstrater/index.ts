import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

export type DemoExample = {
  arg?: unknown
  args?: unknown[]
  desc?: string
}

export type Demo = {
  fn?: (...args: any[]) => unknown
  func?: (...args: any[]) => unknown
  function?: (...args: any[]) => unknown
  name?: string
  desc?: string
  example?: DemoExample[]
  examples?: DemoExample[]
}

export type ExampleResult = {
  index: number
  desc: string | null
  args: JsonValue[]
  ok: boolean
  result: JsonValue
  error: { name: string; message: string } | null
  durationMs: number
}

export type DemoReport = {
  export: string
  name: string
  desc: string | null
  arity: number
  source: string
  examples: ExampleResult[]
}

export type DemonstraterResult = {
  file: string
  ok: boolean
  demos: DemoReport[]
  error: { name: string; message: string } | null
}

const MAX_DEPTH = 6
const MAX_ITEMS = 200
const MAX_STRING = 5_000

// -- serialization ------------------------------------------------------------

function serialize(value: unknown, depth = 0, seen = new WeakSet<object>()): JsonValue {
  if (value === null) return null
  if (value === undefined) return { __type: "undefined" }

  const t = typeof value

  if (t === "string") {
    const s = value as string
    return s.length > MAX_STRING ? `${s.slice(0, MAX_STRING)}…` : s
  }
  if (t === "boolean") return value as boolean
  if (t === "number") {
    const n = value as number
    return Number.isFinite(n) ? n : { __type: "number", value: String(n) }
  }
  if (t === "bigint") return { __type: "bigint", value: (value as bigint).toString() }
  if (t === "symbol") return { __type: "symbol", value: String(value) }
  if (t === "function") {
    const f = value as Function
    return { __type: "function", name: f.name || "anonymous", arity: f.length }
  }

  const obj = value as object

  if (depth >= MAX_DEPTH) return { __type: "truncated", preview: String(obj) }
  if (seen.has(obj)) return { __type: "circular" }
  seen.add(obj)

  if (obj instanceof Error) {
    return { __type: "error", name: obj.name, message: obj.message, stack: obj.stack ?? null }
  }
  if (obj instanceof Date) return { __type: "date", value: obj.toISOString() }
  if (obj instanceof RegExp) return { __type: "regexp", value: obj.toString() }
  if (obj instanceof Map) {
    return {
      __type: "map",
      entries: [...obj.entries()].slice(0, MAX_ITEMS).map(([k, v]) => [serialize(k, depth + 1, seen), serialize(v, depth + 1, seen)]),
    }
  }
  if (obj instanceof Set) {
    return { __type: "set", values: [...obj.values()].slice(0, MAX_ITEMS).map((v) => serialize(v, depth + 1, seen)) }
  }
  if (ArrayBuffer.isView(obj)) {
    return { __type: "binary", kind: obj.constructor.name, byteLength: (obj as any).byteLength }
  }
  if (Array.isArray(obj)) {
    const items = obj.slice(0, MAX_ITEMS).map((v) => serialize(v, depth + 1, seen))
    if (obj.length > MAX_ITEMS) items.push({ __type: "truncated", omitted: obj.length - MAX_ITEMS })
    return items
  }

  const out: Record<string, JsonValue> = {}
  for (const [k, v] of Object.entries(obj)) out[k] = serialize(v, depth + 1, seen)
  return out
}

// -- demo detection -----------------------------------------------------------

function getFn(demo: Demo) {
  return demo.fn ?? demo.func ?? demo.function
}

function getExamples(demo: Demo): DemoExample[] {
  return demo.examples ?? demo.example ?? []
}

function isDemo(value: unknown): value is Demo {
  if (typeof value !== "object" || value === null) return false
  const d = value as Demo
  return typeof getFn(d) === "function" && Array.isArray(getExamples(d))
}

function toArgs(example: DemoExample): unknown[] {
  if (Array.isArray(example.args)) return example.args
  if (!("arg" in example)) return []
  return Array.isArray(example.arg) ? example.arg : [example.arg]
}

function toError(e: unknown) {
  if (e instanceof Error) return { name: e.name, message: e.message }
  return { name: "UnknownError", message: String(e) }
}

// -- runner -------------------------------------------------------------------

async function runExample(fn: Function, example: DemoExample, index: number): Promise<ExampleResult> {
  const args = toArgs(example)
  const started = performance.now()

  try {
    const result = await fn(...args)
    return {
      index,
      desc: example.desc ?? null,
      args: args.map((a) => serialize(a)),
      ok: true,
      result: serialize(result),
      error: null,
      durationMs: +(performance.now() - started).toFixed(3),
    }
  } catch (e) {
    return {
      index,
      desc: example.desc ?? null,
      args: args.map((a) => serialize(a)),
      ok: false,
      result: null,
      error: toError(e),
      durationMs: +(performance.now() - started).toFixed(3),
    }
  }
}

async function reportDemo(exportName: string, demo: Demo): Promise<DemoReport> {
  const fn = getFn(demo)!
  const examples = getExamples(demo)

  return {
    export: exportName,
    name: demo.name ?? fn.name ?? exportName,
    desc: demo.desc ?? null,
    arity: fn.length,
    source: fn.toString(),
    examples: await Promise.all(examples.map((e, i) => runExample(fn, e, i))),
  }
}

/** Dynamically imports `file`, runs every exported demo's examples, returns JSON for the frontend. */
export async function demonstrate(file: string): Promise<DemonstraterResult> {
  const absolute = resolve(file)

  try {
    const mod = (await import(`${pathToFileURL(absolute).href}?t=${Date.now()}`)) as Record<string, unknown>
    const entries = Object.entries(mod).filter(([, v]) => isDemo(v)) as [string, Demo][]
    const demos = await Promise.all(entries.map(([name, demo]) => reportDemo(name, demo)))

    return {
      file: absolute,
      ok: demos.every((d) => d.examples.every((e) => e.ok)),
      demos,
      error: demos.length ? null : { name: "NoDemoError", message: `no demo export found in ${absolute}` },
    }
  } catch (e) {
    return { file: absolute, ok: false, demos: [], error: toError(e) }
  }
}

export default demonstrate
