import { describe, expect, test } from "bun:test"
import { createMemoryProject } from "../../project"
import { exportTree } from "./index"

const source = `
  /* src/index.ts */
  export { a as alpha } from "./utils/a"
  export * from "./b"
  export * from "./nested"

  /* src/utils/a.ts */
  export const a = 1

  /* src/b.ts */
  export function b() {}
  function hidden() {}

  /* src/nested/index.ts */
  export { C } from "./c"

  /* src/nested/c.ts */
  export type C = { c: string }

  /* src/unexported.ts */
  export const x = 1
`

describe("exportTree", () => {
  test("lists only files backing the barrel's exports", () => {
    const project = createMemoryProject(source)
    expect(exportTree(project)).toBe(
      [
        "src/",
        "├── nested/",
        "│   └── c.ts",
        "├── utils/",
        "│   └── a.ts",
        "├── b.ts",
        "└── index.ts",
      ].join("\n"),
    )
  })

  test("annotates files with their public names", () => {
    const project = createMemoryProject(source)
    expect(exportTree(project, { names: true })).toBe(
      [
        "src/",
        "├── nested/",
        "│   └── c.ts (C)",
        "├── utils/",
        "│   └── a.ts (alpha)",
        "├── b.ts (b)",
        "└── index.ts",
      ].join("\n"),
    )
  })

  test("throws when the entry is missing", () => {
    const project = createMemoryProject(source)
    expect(() => exportTree(project, { entry: "src/missing.ts" })).toThrow()
  })
})
