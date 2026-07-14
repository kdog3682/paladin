import { afterAll, beforeAll, expect, mock, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"

const HOME = mkdtempSync(join(tmpdir(), "fdl-"))
const PROJECTS = join(HOME, "projects")

mock.module("node:os", () => ({
    homedir: () => HOME,
    tmpdir,
}))

const { fastDependencyList } = await import("./fastDependencyList")

function write(rel: string, content: string): string {
    const full = join(PROJECTS, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
    return full
}

const MANIM = "mathpen/packages/manim"
const files: Record<string, string> = {}

beforeAll(() => {
    files.entry = write(
        `${MANIM}/src/demos/paragraph.ts`,
        `import { Text, render } from "@mathpen/manim"
         import { helper } from "./helper"
         import chalk from "chalk"`,
    )
    files.helper = write(`${MANIM}/src/demos/helper.ts`, `import { shared } from "../shared/util"`)
    files.util = write(`${MANIM}/src/shared/util.ts`, `import { render } from "../index"`)
    files.index = write(`${MANIM}/src/index.ts`, `export * from "./shared/util"`)
    write(`${MANIM}/package.json`, JSON.stringify({ name: "@mathpen/manim", main: "src/index.ts" }))

    // outside the entry's project → must not be traversed
    write("paladin/packages/utils/src/index.ts", `import { nope } from "./nope"`)
    write("paladin/packages/utils/src/nope.ts", "export const nope = 1")
})

afterAll(() => rmSync(HOME, { recursive: true, force: true }))

test("recurses relative + same-project workspace imports, deduped, entry excluded", () => {
    const deps = fastDependencyList(files.entry)
    expect(new Set(deps)).toEqual(new Set([files.helper, files.util, files.index]))
    expect(deps).toHaveLength(3)
    expect(deps).not.toContain(files.entry)
})

test("ignores external packages and cross-project workspace imports", () => {
    const cross = write(
        `${MANIM}/src/demos/cross.ts`,
        `import { x } from "@paladin/utils"
         import lodash from "lodash"`,
    )
    expect(fastDependencyList(cross)).toEqual([])
})

test("handles cycles", () => {
    const a = write(`${MANIM}/src/cycle/a.ts`, `import { b } from "./b"`)
    const b = write(`${MANIM}/src/cycle/b.ts`, `import { a } from "./a"`)
    expect(fastDependencyList(a)).toEqual([b])
})
