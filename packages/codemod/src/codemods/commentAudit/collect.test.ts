import { expect, test } from "bun:test"
import { createMemoryProject } from "../../project"
import { collectEntries } from "./collect"
import { collectComments } from "./index"

/*
 * one of every kind of entry: a declaration comment over the length limit, an inline object type
 * in a param, a type that is only reachable through another type, a class with private members,
 * a helper that is only used in a body, and a file outside the surface
 */
const template = `
  /* src/index.ts */
  export { readConfig, type Config } from "./config"
  export { Store } from "./store"

  /* src/config.ts */
  import type { Source } from "./source"

  /**
   * Reads the config file at the given path and merges it over the defaults. The file is
   * parsed as JSON5, so comments and trailing commas are allowed. Relative paths inside it
   * are resolved against the directory of the config file rather than the working directory.
   * A missing file is not an error: the defaults come back unchanged. Unknown keys are
   * dropped with a warning.
   */
  export function readConfig(path: string, opts: {
    strict?: boolean
  }): Config {
    const text = readText(path)
    return { source: "file", retries: text ? 3 : 0 }
  }

  function readText(path: string): string {
    return path
  }

  export type Config = {
    /** where values come from */
    source: Source
    retries: number
  }

  /* src/source.ts */
  export type Source = "file" | "env"

  /* src/store.ts */
  /** An in-memory key-value store. */
  export class Store {
    #data = new Map<string, string>()
    get(key: string): string | undefined { return this.#data.get(key) }
    private touch() {}
  }

  /* src/internal.ts */
  export const unused = 1
`

test("numbers the entries that need a comment", () => {
  const project = createMemoryProject(template)
  const { ids } = collectComments(project)
  expect(Object.values(ids).map(entry => entry.id)).toEqual([
    "src/config.ts#readConfig", // comment is over 240 characters
    "src/config.ts#readConfig.opts.strict", // field of an inline object type in a param
    "src/config.ts#Config",
    "src/config.ts#Config.retries", // Config.source has a comment, so it gets no number
    "src/source.ts#Source", // not exported from index, pulled in through Config.source
    "src/store.ts#Store.get", // Store's own comment is short enough, #data and touch aren't public
  ])
})

test("leaves out private helpers and files outside the surface", () => {
  const project = createMemoryProject(template)
  const ids = collectEntries(project).flatMap(entry => [entry, ...entry.members]).map(entry => entry.id)
  expect(ids).not.toContain("src/config.ts#readText") // only used in a body
  expect(ids).not.toContain("src/internal.ts#unused") // not reachable from src/index.ts
  expect(ids).toContain("src/store.ts#Store") // documented entries are still collected
})

test("renders the declarations the way the docs show them", () => {
  const project = createMemoryProject(template)
  // readConfig is numbered, so it keeps its body; Store isn't, so get's body is elided
  // the /** */ comment of Store is shown as it will be written: /* */
  expect(collectComments(project).declarations).toBe(`## src/config.ts

[1] ✎ long
/*
 * Reads the config file at the given path and merges it over the defaults. The file is
 * parsed as JSON5, so comments and trailing commas are allowed. Relative paths inside it
 * are resolved against the directory of the config file rather than the working directory.
 * A missing file is not an error: the defaults come back unchanged. Unknown keys are
 * dropped with a warning.
 */
export function readConfig(path: string, opts: {
  [2] ✗ missing
  strict?: boolean
}): Config {
  const text = readText(path)
  return { source: "file", retries: text ? 3 : 0 }
}

[3] ✗ missing
export type Config = {
  /** where values come from */
  source: Source
  [4] ✗ missing
  retries: number
}

## src/source.ts

[5] ✗ missing
export type Source = "file" | "env"

## src/store.ts

/* An in-memory key-value store. */
export class Store {
  [6] ✗ missing
  get(key: string): string | undefined { … }
}`)
})

test("flags long comments by the threshold", () => {
  const project = createMemoryProject(template)
  const ids = Object.values(collectComments(project, { longThreshold: 1000 }).ids).map(entry => entry.id)
  expect(ids).not.toContain("src/config.ts#readConfig")
})

test("gives the same nonce for the same entries", () => {
  const project = createMemoryProject(template)
  const { nonce } = collectComments(project)
  expect(nonce).toMatch(/^[0-9a-f]{6}$/)
  expect(collectComments(project).nonce).toBe(nonce)
})

test("hashes the signature, not comments or bodies", () => {
  const project = createMemoryProject(template)
  const hashes = () => new Map(
    collectEntries(project).flatMap(entry => [entry, ...entry.members]).map(entry => [entry.id, entry.hash]),
  )
  const before = hashes()
  const file = project.getSourceFileOrThrow("config.ts")

  file.replaceWithText(file.getFullText()
    .replace("  retries: number", "  /** how often to retry */\n  retries: number")
    .replace("text ? 3 : 0", "text ? 5 : 0"))
  expect(hashes()).toEqual(before)

  file.replaceWithText(file.getFullText().replace("retries: number", "retries: string"))
  const after = hashes()
  expect(after.get("src/config.ts#Config")).not.toBe(before.get("src/config.ts#Config"))
  expect(after.get("src/config.ts#Config.retries")).not.toBe(before.get("src/config.ts#Config.retries"))
  expect(after.get("src/config.ts#readConfig")).toBe(before.get("src/config.ts#readConfig")) // refers to Config by name only
})
