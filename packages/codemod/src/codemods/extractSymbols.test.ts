import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { writeFilesFromTemplate } from "@paladin/utils"
import { Project, ts } from "ts-morph"
import { extractSymbols } from "./extractSymbols"

let root: string

beforeEach(() => {
  // realpath so macOS's /var -> /private/var symlink can't split one file into two paths
  root = realpathSync(mkdtempSync(join(tmpdir(), "extract-symbols-")))
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

/** writes the template and returns an empty project, so every file must be reached by imports */
function setup(template: string): Project {
  writeFilesFromTemplate(template, { root })
  return new Project({
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
    },
  })
}

function loaded(project: Project): string[] {
  return project
    .getSourceFiles()
    .map(file => relative(root, file.getFilePath()))
    .sort()
}

describe("extractSymbols", () => {
  test("inlines dependencies in dependency order, without comments or unused code", () => {
    const project = setup(`
      /* src/entry.ts */
      import { helper } from "./helper"
      import { unused } from "./unrelated"
      import type { Config } from "./types"

      const PREFIX = "x"

      function internal(config: Config) {
        return PREFIX + helper(config.name) // join them
      }

      /** the entry point */
      export function main(config: Config) {
        return internal(config)
      }

      export function other() {
        return unused()
      }

      /* src/helper.ts */
      import { shout } from "./strings"

      /** shouts the name */
      export function helper(name: string) {
        // make it loud
        return shout(name)
      }

      export function notNeeded() {}

      /* src/strings.ts */
      export const shout = (s: string) => s.toUpperCase()

      /* src/types.ts */
      export type Config = { name: string; level: Level }

      type Level = "low" | "high"

      /* src/unrelated.ts */
      export const unused = () => 1
    `)

    const output = extractSymbols(
      project,
      [
        { file: "src/entry.ts", symbols: ["main"] },
        /// already pulled in through main, so it is not repeated, but it keeps its export
        { file: "src/helper.ts", symbols: ["helper"] },
      ],
      { root },
    )

    /// imports between project files are gone, and only requested symbols stay exported
    expect(output).toBe(`type Level = "low" | "high"

type Config = { name: string; level: Level }

const PREFIX = "x"

const shout = (s: string) => s.toUpperCase()

export function helper(name: string) {
  return shout(name)
}

function internal(config: Config) {
  return PREFIX + helper(config.name)
}

export function main(config: Config) {
  return internal(config)
}
`)
    /// unrelated.ts is imported by entry.ts, but nothing extracted uses it
    expect(loaded(project)).toEqual([
      "src/entry.ts",
      "src/helper.ts",
      "src/strings.ts",
      "src/types.ts",
    ])
  })

  test("renames aliased imports to the declaration they reach through a barrel", () => {
    const project = setup(`
      /* src/entry.ts */
      import { renamed, fromStar } from "./barrel"

      export const run = () => renamed() + fromStar

      /* src/barrel.ts */
      export { original as renamed, sibling } from "./a"
      export * from "./b"
      export * from "./c"

      /* src/a.ts */
      export function original() { return 1 }

      export function sibling() { return 2 }

      /* src/b.ts */
      export const bOnly = 1

      /* src/c.ts */
      export const fromStar = 2
    `)

    const output = extractSymbols(project, [{ file: "src/entry.ts", symbols: ["run"] }], { root })

    /// `renamed()` becomes `original()`
    expect(output).toBe(`function original() { return 1 }

const fromStar = 2

export const run = () => original() + fromStar
`)
  })

  test("inlines namespace members and default imports, and builds an object for a namespace used whole", () => {
    const project = setup(`
      /* src/entry.ts */
      import * as math from "./math"
      import format from "./format"

      export const show = (n: number): math.Rounded => format(math.round(n))

      export const all = () => Object.keys(math)

      /* src/math.ts */
      export type Rounded = string

      export const round = (n: number) => Math.round(n)

      export const floor = (n: number) => Math.floor(n)

      /* src/format.ts */
      export default function format(n: number) {
        return String(n)
      }
    `)

    const output = extractSymbols(
      project,
      [{ file: "src/entry.ts", symbols: ["show", "all"] }],
      { root },
    )

    /// `math.round` becomes `round`; `math` on its own becomes an object of its value exports
    expect(output).toBe(`type Rounded = string

function format(n: number) {
  return String(n)
}

const round = (n: number) => Math.round(n)

export const show = (n: number): Rounded => format(round(n))

const floor = (n: number) => Math.floor(n)

const math = { round, floor }

export const all = () => Object.keys(math)
`)
  })

  test("merges package imports across files into one line per module, and survives cycles", () => {
    const project = setup(`
      /* src/entry.ts */
      import { z } from "zod"
      import { readFileSync, writeFileSync } from "node:fs"
      import { join } from "node:path"
      import { Node } from "./node"

      export const schema = z.string()

      export function load(dir: string): Node {
        return new Node(readFileSync(join(dir, "a"), "utf8"))
      }

      /* src/node.ts */
      import { join as joinPath } from "node:path"
      import type { Tree } from "./tree"

      export class Node {
        constructor(public text: string) {}
        tree?: Tree
        path = joinPath("a", "b")
      }

      /* src/tree.ts */
      import { Node } from "./node"

      export class Tree {
        root?: Node
      }
    `)

    const output = extractSymbols(project, [{ file: "src/entry.ts", symbols: ["load"] }], { root })

    /// both files import join from node:path: one import, under the name it was first seen with
    /// zod is only used by schema, writeFileSync by nothing
    expect(output).toBe(`import { join as joinPath } from "node:path"
import { readFileSync } from "node:fs"

class Tree {
  root?: Node
}

class Node {
  constructor(public text: string) {}
  tree?: Tree
  path = joinPath("a", "b")
}

export function load(dir: string): Node {
  return new Node(readFileSync(joinPath(dir, "a"), "utf8"))
}
`)
  })

  test("renames declarations whose names clash once collated", () => {
    const project = setup(`
      /* src/entry.ts */
      import { format as formatDate } from "./date"
      import { format as formatMoney } from "./money"

      const format = (a: string, b: string) => \`\${a} \${b}\`

      export const label = (d: Date, n: number) => format(formatDate(d), formatMoney(n))

      /* src/date.ts */
      const pad = (n: number) => String(n).padStart(2, "0")

      export const format = (d: Date) => \`\${d.getFullYear()}-\${pad(d.getMonth() + 1)}\`

      /* src/money.ts */
      const pad = (s: string) => s.padStart(8)

      export const format = (n: number) => pad(n.toFixed(2))
    `)

    const output = extractSymbols(project, [{ file: "src/entry.ts", symbols: ["label"] }], { root })

    /// the first declaration of a name keeps it, later ones get a number
    expect(output).toBe(`const format = (a: string, b: string) => \`\${a} \${b}\`

const pad = (n: number) => String(n).padStart(2, "0")

const format2 = (d: Date) => \`\${d.getFullYear()}-\${pad(d.getMonth() + 1)}\`

const pad2 = (s: string) => s.padStart(8)

const format3 = (n: number) => pad2(n.toFixed(2))

export const label = (d: Date, n: number) => format(format2(d), format3(n))
`)
  })

  test("resolves a local export alias to the declaration behind it", () => {
    const project = setup(`
      /* src/entry.ts */
      const secret = 42

      const hidden = () => secret

      const other = 1

      export { hidden as visible, other }
    `)

    const output = extractSymbols(project, [{ file: "src/entry.ts", symbols: ["visible"] }], { root })

    expect(output).toBe(`const secret = 42

const hidden = () => secret
`)
  })

  test("throws for a name the file neither declares nor exports", () => {
    const project = setup(`
      /* src/entry.ts */
      export const a = 1
    `)

    expect(() =>
      extractSymbols(project, [{ file: "src/entry.ts", symbols: ["nope"] }], { root }),
    ).toThrow(`src/entry.ts: no declaration or export named "nope"`)
  })
})
