import { describe, expect, test } from "bun:test"
import { fancyFileTree, unexpand, type FileEntry } from "./fancyFileTree"

const src = "/home/nina/projects/mathpen/packages/manim/src"

const entries: FileEntry[] = [
  [`${src}/math/expr/select.ts`, ["Selection", "select"]],
  [`${src}/math/expr/parse.ts`, ["parse"]],
  [`${src}/index.ts`, []],
]

describe("unexpand", () => {
  test("folds /home/<name>", () => {
    expect(unexpand("/home/nina/projects/x")).toBe("~/projects/x")
  })

  test("folds /Users/<name>", () => {
    expect(unexpand("/Users/nina/x")).toBe("~/x")
  })

  test("leaves other roots alone", () => {
    expect(unexpand("/opt/x")).toBe("/opt/x")
    expect(unexpand("/homework/x")).toBe("/homework/x")
  })

  test("honours an explicit home", () => {
    expect(unexpand("/srv/app/x", "/srv/app")).toBe("~/x")
  })
})

describe("fancyFileTree", () => {
  test("empty", () => {
    expect(fancyFileTree([])).toBe("")
  })

  test("expanded", () => {
    expect(fancyFileTree(entries, { concat: false })).toBe(
      [
        "~/projects/mathpen/packages/manim/src",
        "  math/",
        "   expr/",
        "    parse.ts",
        "      parse",
        "    select.ts",
        "      Selection",
        "      select",
        "  index.ts",
      ].join("\n"),
    )
  })

  test("concatenated", () => {
    expect(fancyFileTree(entries)).toBe(
      [
        "~/projects/mathpen/packages/manim/src",
        "  math/expr/",
        "   parse.ts",
        "     parse",
        "   select.ts",
        "     Selection",
        "     select",
        "  index.ts",
      ].join("\n"),
    )
  })

  test("single entry hoists the whole dir into the root", () => {
    expect(fancyFileTree([["/home/nina/pkg/src/a/b/c.ts", ["C"]]])).toBe(
      ["~/pkg/src/a/b", "  c.ts", "    C"].join("\n"),
    )
  })

  test("no common root, no header", () => {
    expect(
      fancyFileTree([
        ["a/x.ts", ["X"]],
        ["b/y.ts", ["Y"]],
      ]),
    ).toBe(["a/x.ts", "  X", "b/y.ts", "  Y"].join("\n"))
  })
})
