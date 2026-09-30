import { describe, expect, test } from "bun:test"
import type { Project } from "ts-morph"
import { createMemoryProject } from "../../project"
import { demoToExamples } from "./index"

/** trims and collapses runs of blank lines, so spacing left by removals doesn't matter */
function read(project: Project, path: string): string {
  return project.getSourceFileOrThrow(path).getFullText().trim().replace(/\n{3,}/g, "\n\n")
}

describe("demoToExamples", () => {
  test("turns each labelled value into an example and inlines what it relies on", () => {
    const project = createMemoryProject(`
      /* src/node/demo.ts */
      export const demo = { run(...args: unknown[]) {} }

      /* src/text.ts */
      export class Text {
        constructor(public text: string) {}
        moveTo(other: Text) {}
      }

      /* src/text.demo.ts */
      import { demo } from "./node/demo"
      import { Text } from "./text"

      const a = new Text("a")

      const b = new Text("b")

      a.moveTo(b)

      demo.run(
        "default text fox",
        new Text("The quick brown fox"),

        "bold",
        [a, b],
      )
    `)

    demoToExamples(project)

    expect(project.getSourceFile("src/text.demo.ts")).toBeUndefined()
    expect(read(project, "src/text.examples.ts")).toBe(`import { Text } from "./text"

/* default text fox */
export function defaultTextFox() {
  return new Text("The quick brown fox")
}

/* bold */
export function bold() {
  const a = new Text("a")
  const b = new Text("b")
  a.moveTo(b)
  return [a, b]
}`)
  })

  test("keeps functions at module scope and copies shared variables into each example", () => {
    const project = createMemoryProject(`
      /* src/node/demo.ts */
      export const demo = { run(...args: unknown[]) {} }

      /* src/text.ts */
      export class Text {
        constructor(public text: string) {}
      }

      /* src/shared.demo.ts */
      import { demo } from "./node/demo"
      import { Text } from "./text"

      const word = "fox"

      function make(text: string) {
        return new Text(text)
      }

      demo.run(
        "first",
        make(word),
        "second",
        [make(word), make("dog")],
      )
    `)

    demoToExamples(project)

    expect(read(project, "src/shared.examples.ts")).toBe(`import { Text } from "./text"

function make(text: string) {
  return new Text(text)
}

/* first */
export function first() {
  const word = "fox"
  return make(word)
}

/* second */
export function second() {
  const word = "fox"
  return [make(word), make("dog")]
}`)
  })

  test("duplicates a shared variable and its mutations into every example that uses it", () => {
    const project = createMemoryProject(`
      /* src/node/demo.ts */
      export const demo = { run(...args: unknown[]) {} }

      /* src/text.ts */
      export class Text {
        constructor(public text: string) {}
        moveTo(other: Text) {}
        scale(by: number) {}
      }

      /* src/move.demo.ts */
      import { demo } from "./node/demo"
      import { Text } from "./text"

      const a = new Text("a")
      const b = new Text("b")
      a.moveTo(b)
      const c = new Text(
        "a long piece of text",
      )
      c.scale(2)

      demo.run(
        "just a",
        a,
        "a and c",
        [a, c],
      )
    `)

    demoToExamples(project)

    expect(read(project, "src/move.examples.ts")).toBe(`import { Text } from "./text"

/* just a */
export function justA() {
  const a = new Text("a")
  const b = new Text("b")
  a.moveTo(b)
  return a
}

/* a and c */
export function aAndC() {
  const a = new Text("a")
  const b = new Text("b")
  a.moveTo(b)

  const c = new Text(
    "a long piece of text",
  )

  c.scale(2)
  return [a, c]
}`)
  })

  test("prunes exports of demo-only modules that nothing uses any more", () => {
    const project = createMemoryProject(`
      /* src/node/demo.ts */
      export const demo = { run(...args: unknown[]) {} }

      /* src/text.ts */
      export class Text {
        constructor(public text: string) {}
      }

      /* src/fixtures.ts */
      import { Text } from "./text"
      export const sample = new Text("sample")
      export const leftover = new Text("leftover")

      /* src/fixtures.demo.ts */
      import { demo } from "./node/demo"
      import { sample } from "./fixtures"

      demo.run("sample", sample)
    `)

    demoToExamples(project)

    expect(read(project, "src/fixtures.ts")).toBe(`import { Text } from "./text"
export const sample = new Text("sample")`)
    expect(read(project, "src/node/demo.ts")).toContain("export const demo")
  })

  test("names an unlabelled value after a hash of it and leaves out the comment", () => {
    const source = `
      /* src/node/demo.ts */
      export const demo = { run(...args: unknown[]) {} }

      /* src/text.ts */
      export class Text {
        constructor(public text: string) {}
      }

      /* src/bare.demo.ts */
      import { demo } from "./node/demo"
      import { Text } from "./text"

      demo.run(
        new Text("unlabelled"),
        "labelled",
        new Text("labelled"),
      )
    `
    const project = createMemoryProject(source)
    demoToExamples(project)
    const output = read(project, "src/bare.examples.ts")

    const match = output.match(/^export function ([a-z]{6})\(\) \{\n  return new Text\("unlabelled"\)\n\}$/m)
    expect(match).not.toBeNull()
    expect(output).not.toMatch(/\*\/\nexport function [a-z]{6}\(\)/)
    expect(output).toContain("/* labelled */\nexport function labelled() {")

    // the same value always gets the same name
    const again = createMemoryProject(source)
    demoToExamples(again)
    expect(read(again, "src/bare.examples.ts")).toContain(`export function ${match![1]}() {`)
  })

  test("avoids names already taken and labels that aren't identifiers", () => {
    const project = createMemoryProject(`
      /* src/node/demo.ts */
      export const demo = { run(...args: unknown[]) {} }

      /* src/text.ts */
      export class Text {
        constructor(public text: string) {}
      }

      /* src/names.demo.ts */
      import { demo } from "./node/demo"
      import { Text } from "./text"

      export function text() {
        return new Text("helper")
      }

      demo.run(
        "text",
        text(),
        "default",
        new Text("d"),
        "3d view",
        new Text("3d"),
      )
    `)

    demoToExamples(project)

    const output = read(project, "src/names.examples.ts")
    expect(output).toContain("export function text2() {")
    expect(output).toContain("export function default2() {")
    expect(output).toContain("export function example3dView() {")
  })
})
