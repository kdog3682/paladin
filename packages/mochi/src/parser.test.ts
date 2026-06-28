import { describe, test, expect } from "bun:test"
import { parseMochiFile } from "./parser"

const source = `
import { add, slugify, formatDate, createUser } from "./utils"

/* math */

// basic addition
console.log(add(1, 2))
console.log(add(-1, 1))

/* strings */

console.log(slugify("Hello World"))

// locale-dependent
formatDate("2024-01-01")

/* pipeline */

const user = createUser({ name: "kai" })
console.log(formatDate(user.createdAt))
`.trim()

describe("parseMochiFile", () => {
  test("sections from block comments", () => {
    const file = parseMochiFile(source, "demo.ts")
    expect(file.sections.map(s => s.title)).toEqual(["math", "strings", "pipeline"])
  })

  test("math: one story with two calls, no blank line between them", () => {
    const file = parseMochiFile(source, "demo.ts")
    const [s] = file.sections[0].stories
    expect(s.description).toBe("basic addition")
    expect(s.calls).toHaveLength(2)
    expect(s.calls[0]).toMatchObject({ source: "add(1, 2)", isLog: true })
    expect(s.calls[1]).toMatchObject({ source: "add(-1, 1)", isLog: true })
  })

  test("strings: blank line splits into two stories", () => {
    const file = parseMochiFile(source, "demo.ts")
    const strings = file.sections[1]
    expect(strings.stories).toHaveLength(2)
    expect(strings.stories[0].calls[0].source).toBe('slugify("Hello World")')
    expect(strings.stories[1].description).toBe("locale-dependent")
    expect(strings.stories[1].calls[0].isLog).toBe(false)
  })

  test("pipeline: declaration in context, call in calls", () => {
    const file = parseMochiFile(source, "demo.ts")
    const [story] = file.sections[2].stories
    expect(story.context).toHaveLength(1)
    expect(story.context[0]).toMatch(/createUser/)
    expect(story.calls).toHaveLength(1)
    expect(story.calls[0]).toMatchObject({ source: "formatDate(user.createdAt)", isLog: true })
  })
})

describe("section divider formats", () => {
  test("/* block comment */", () => {
    expect(parseMochiFile(`/* math */\nconsole.log(add(1, 2))`, "f.ts").sections[0].title).toBe("math")
  })

  test("/** jsdoc */", () => {
    expect(parseMochiFile(`/** strings */\nconsole.log(x)`, "f.ts").sections[0].title).toBe("strings")
  })

  test("// ---- embedded title ----", () => {
    expect(parseMochiFile(`// ---- math utils ----\nconsole.log(x)`, "f.ts").sections[0].title).toBe("math utils")
  })

  test("sandwich: divider / title / divider", () => {
    const src = `// ----\n// pipeline stuff\n// ----\nconsole.log(x)`
    const file = parseMochiFile(src, "f.ts")
    expect(file.sections[0].title).toBe("pipeline stuff")
    expect(file.sections[0].stories).toHaveLength(1)
  })

  test("solo divider creates untitled section", () => {
    const src = `console.log(x)\n// ====\nconsole.log(y)`
    const file = parseMochiFile(src, "f.ts")
    expect(file.sections).toHaveLength(2)
    expect(file.sections[1].title).toBeNull()
  })
})
