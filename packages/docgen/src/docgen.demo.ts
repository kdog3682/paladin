import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"
import { analyze, docgen } from "./docgen"
import type { DocEntry } from "./docgen.types"
import {clip} from "@paladin/utils"
/**
 * A miniature package written to a temp dir so the demo exercises the real
 * parser rather than a stub. It is shaped to hit every branch that matters:
 * a barrel, an aliased re-export, an unexported return type, a duplicated
 * declaration, and files the exclude presets should drop.
 */
const FIXTURE: Record<string, string> = {
  "src/types.ts": `/** How a selection spans the buffer. */
export type Mode = "line" | "block"

/** A range of selected text. */
export interface Selection {
  /** Start offset, inclusive. */
  from: number
  /** End offset, exclusive. */
  to: number
  mode: Mode
}

/** Not exported: should stay out of the docs unless something references it. */
interface Internal {
  seen: boolean
}
`,

  "src/select.ts": `import type { Selection } from "./types"

/** Outcome of a selection attempt. Never exported, but reachable via \`select\`. */
interface Result {
  ok: boolean
  selection?: Selection
}

/** Selects a range in the buffer. */
export function select(sel: Selection): Result {
  return { ok: sel.to > sel.from, selection: sel }
}

/** Tracks selections over time. */
export class Selector {
  /** Most recent selection, if any. */
  current?: Selection

  /** Applies a selection and returns the result. */
  apply(sel: Selection): Result {
    this.current = sel
    return select(sel)
  }

  private reset(): void {
    this.current = undefined
  }
}
`,

  // Same declaration as types.ts. Dedupe should fold these into one entry and
  // keep the copy the rest of the package actually imports.
  "src/legacy.ts": `/** A range of selected text. */
export interface Selection {
  /** Start offset, inclusive. */
  from: number
  /** End offset, exclusive. */
  to: number
  mode: Mode
}

export type Mode = "line" | "block"
`,

  "src/index.ts": `export * from "./types"
export * from "./select"
export * from "./legacy"
export { select as pick } from "./select"
export * from "lodash"
`,

  // Both of these should be skipped by the default exclude presets.
  "src/select.test.ts": `import { select } from "./select"
export const smoke = () => select({ from: 0, to: 1, mode: "line" })
`,
  "src/render.demo.ts": `export const demoOnly = 1
`,
}

function scaffold(): string {
  const dir = mkdtempSync(join(tmpdir(), "docgen-demo-"))
  for (const [path, contents] of Object.entries(FIXTURE)) {
    const file = join(dir, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, contents, "utf8")
  }
  return dir
}

function heading(label: string): void {
  console.log(`\n${"─".repeat(72)}\n${label}\n${"─".repeat(72)}`)
}

function table(entries: DocEntry[], root: string): void {
  const rows = entries.map((entry) => ({
    symbol: entry.exposedAs,
    kind: entry.symbol.kind,
    file: relative(root, entry.file),
    why: entry.reason,
    refs: String(entry.references),
    notes: [
      entry.aliases.length > 0 ? `aka ${entry.aliases.join("/")}` : "",
      entry.duplicates.length > 0
        ? `folded ${entry.duplicates.map((file) => relative(root, file)).join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join(" · "),
  }))

  const columns = ["symbol", "kind", "file", "why", "refs", "notes"] as const
  const width = (column: (typeof columns)[number]) =>
    Math.max(column.length, ...rows.map((row) => row[column].length))

  const line = (cells: Record<(typeof columns)[number], string>) =>
    columns.map((column) => cells[column].padEnd(width(column))).join("  ").trimEnd()

  console.log(line({ symbol: "symbol", kind: "kind", file: "file", why: "why", refs: "refs", notes: "notes" }))
  for (const row of rows) console.log(line(row))
}

async function main(): Promise<void> {
  const dir = scaffold()
  const src = join(dir, "src")

  try {
    // 1. The common case: point it at a directory and print the result.
    //    index.ts contributes nothing of its own, and the .test/.demo files
    //    never get parsed.
    heading("docgen(dir) — whole package")
    console.log(await docgen(src))

    // 2. A single file still documents what its signatures depend on: Selection
    //    is resolved through select.ts's own import and parsed on demand.
    heading("docgen(file) — one entry point, neighbours pulled in")
    console.log(await docgen(join(src, "select.ts")))

    // 3. Stop at params/returns instead of chasing types out of types.
    //    Mode drops out, since only Selection mentions it.
    heading("docgen(dir, { transitive: false })")
    console.log(await docgen(src, { transitive: false }))

    // 4. Narrow the documented exports. Referenced types still come along,
    //    otherwise the signatures would dangle.
    heading("docgen(dir, { kinds: ['function'], fence: false })")
    console.log(await docgen(src, { kinds: ["function"], fence: false }))

    // 5. The model behind the text: where each symbol came from, how often it
    //    is referenced, and which duplicates were folded away.
    heading("analyze(dir) — entry model")
    const result = await analyze(src)
    table(result.entries, src)
    console.log(`\nfiles: ${result.files.join(", ")}`)
    console.log(`unresolved: ${result.unresolved.join(", ") || "none"}`)
    console.log(`failed: ${result.failed.length}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// if (import.meta.main) await main()


clip(await docgen('/home/kdog3682/projects/mathpen/packages/manim/sr'))
