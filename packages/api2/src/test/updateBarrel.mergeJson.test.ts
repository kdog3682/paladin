import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { updateBarrel } from "../services/scaffold/postProcessors/updateBarrel"
import { write } from "../services/scaffold/ops"
import type { PostProcessorOptions } from "../services/scaffold/postProcessors/types"
import type { Unit } from "../services/scaffold/types"

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "barrel-"))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** put a real file on disk under the unit */
function touch(rel: string, content = "export const x = 1\n") {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  return path
}

/** a unit whose pass writes these (not-yet-existing) paths */
function unitWith(...rels: string[]): Unit {
  const ops = rels.map((rel) => write("test", join(root, rel), "export const x = 1\n"))
  return { dir: root, ops } as Unit
}

/** the export lines updateBarrel would append, or [] */
function linesFor(unit: Unit, opts: PostProcessorOptions = {}): string[] {
  const ops = updateBarrel(unit, opts)
  return ops.flatMap((op) => {
    const content = (op as { content?: string }).content ?? ""
    return content.trim() ? content.trim().split("\n") : []
  })
}

/** always-barrel everything in the temp unit */
const always: PostProcessorOptions = { updateBarrel: { alwaysBarrel: ["**/src/**"] } }

describe("without alwaysBarrel", () => {
  test("src/fs/mergeJson.ts fails every entry rule", () => {
    expect(linesFor(unitWith("src/fs/mergeJson.ts"))).toEqual([])
  })

  test("matches alone does not help — it is a scope gate, not a rule", () => {
    const opts: PostProcessorOptions = { updateBarrel: { matches: ["**"] } }
    expect(linesFor(unitWith("src/fs/mergeJson.ts"), opts)).toEqual([])
  })
})

describe("alwaysBarrel", () => {
  test("exports the flat category member", () => {
    expect(linesFor(unitWith("src/fs/mergeJson.ts"), always)).toEqual([
      'export * from "./fs/mergeJson"',
    ])
  })

  test("exports several members of the same category", () => {
    const lines = linesFor(unitWith("src/fs/mergeJson.ts", "src/fs/readJson.ts"), always)
    expect(lines).toEqual(['export * from "./fs/mergeJson"', 'export * from "./fs/readJson"'])
  })

  test("a member already listed does not stop its siblings", () => {
    touch("src/index.ts", 'export * from "./fs/mergeJson"\n')
    expect(linesFor(unitWith("src/fs/readJson.ts"), always)).toEqual([
      'export * from "./fs/readJson"',
    ])
  })

  test("reaches deeper than two levels", () => {
    expect(linesFor(unitWith("src/fs/json/merge.ts"), always)).toEqual([
      'export * from "./fs/json/merge"',
    ])
  })

  test("works with every other rule turned off", () => {
    const opts: PostProcessorOptions = {
      updateBarrel: {
        fileMatchesFolder: false,
        treatIndexAsEntry: false,
        treatNamedIndexAsEntry: false,
        fileRelativeToBarrelIndex: false,
        alwaysBarrel: ["**/src/**"],
      },
    }
    expect(linesFor(unitWith("src/fs/mergeJson.ts"), opts)).toEqual([
      'export * from "./fs/mergeJson"',
    ])
  })
})

describe("alwaysBarrel still yields to ownership", () => {
  test("a folder entry on disk answers for its members", () => {
    touch("src/fs/index.ts")
    expect(linesFor(unitWith("src/fs/mergeJson.ts"), always)).toEqual([])
  })

  test("a folder entry written in the same pass wins over its members", () => {
    const lines = linesFor(unitWith("src/fs/index.ts", "src/fs/mergeJson.ts"), always)
    expect(lines).toEqual(['export * from "./fs/index"'])
  })
})

describe("alwaysBarrel is scoped by path, not by unit", () => {
  test("only the named folder opts in", () => {
    const opts: PostProcessorOptions = { updateBarrel: { alwaysBarrel: ["**/src/fs/**"] } }
    const lines = linesFor(unitWith("src/fs/mergeJson.ts", "src/http/getJson.ts"), opts)
    expect(lines).toEqual(['export * from "./fs/mergeJson"'])
  })

  test("matches still gates the whole processor", () => {
    const opts: PostProcessorOptions = {
      updateBarrel: { matches: ["**/some-other-pkg"], alwaysBarrel: ["**/src/**"] },
    }
    expect(linesFor(unitWith("src/fs/mergeJson.ts"), opts)).toEqual([])
  })
})

describe("the ordinary exclusions still hold", () => {
  test("an existing file is not re-exported", () => {
    touch("src/fs/mergeJson.ts")
    expect(linesFor(unitWith("src/fs/mergeJson.ts"), always)).toEqual([])
  })

  test("src/test/ is excluded", () => {
    expect(linesFor(unitWith("src/test/mergeJson.ts"), always)).toEqual([])
  })

  test("non-source files are excluded", () => {
    expect(linesFor(unitWith("src/fs/fixture.json"), always)).toEqual([])
  })
})
