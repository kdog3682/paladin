import { describe, expect, test } from "bun:test"
import { createMemoryProject } from "../project"
import { removeUnusedSymbols } from "./removeUnusedSymbols"

describe("removeUnusedSymbols", () => {
  test("removes unused exports and cascades into what they relied on", () => {
    const project = createMemoryProject(`
      /* src/a.ts */
      export const used = 1
      export const unused = helper()
      function helper() {
        return 2
      }

      /* src/b.ts */
      import { used } from "./a"
      console.log(used)
    `)

    removeUnusedSymbols(project)

    expect(project.getSourceFileOrThrow("src/a.ts").getFullText().trim()).toBe("export const used = 1")
    expect(project.getSourceFileOrThrow("src/b.ts").getFullText()).toContain(`import { used } from "./a"`)
  })

  test("drops re-binding specifiers and deletes files left empty", () => {
    const project = createMemoryProject(`
      /* src/c.ts */
      export const gone = 1

      /* src/d.ts */
      import { gone } from "./c"
      export const kept = 2
    `)

    removeUnusedSymbols(project, {
      files: [project.getSourceFileOrThrow("src/c.ts")],
    })

    expect(project.getSourceFile("src/c.ts")).toBeUndefined()
    expect(project.getSourceFileOrThrow("src/d.ts").getFullText().trim()).toBe("export const kept = 2")
  })

  test("leaves kept, default and star re-exported declarations alone", () => {
    const project = createMemoryProject(`
      /* src/e.ts */
      export const entry = 1
      export default function main() {}

      /* src/f.ts */
      export const starred = 1

      /* src/index.ts */
      export * from "./f"
    `)

    removeUnusedSymbols(project, {
      files: [project.getSourceFileOrThrow("src/e.ts"), project.getSourceFileOrThrow("src/f.ts")],
      keep: statement => statement.getText().includes("entry"),
    })

    const e = project.getSourceFileOrThrow("src/e.ts").getFullText()
    expect(e).toContain("export const entry")
    expect(e).toContain("export default function main")
    expect(project.getSourceFileOrThrow("src/f.ts").getFullText()).toContain("export const starred")
  })
})
