import { expect, test } from "bun:test"
import { createMemoryProject } from "../../project"
import { applyComments } from "./apply"
import { collectComments } from "./index"
import { parseResponse } from "./parse"

/*
 * a JSDoc comment to replace, a declaration comment over the length limit, an inline object type
 * on one line, and fields with and without comments
 */
const template = `
  /* src/index.ts */
  export { area, perimeter, type Shape } from "./shapes"

  /* src/shapes.ts */
  /** Computes the area of the shape by switching on its kind and applying the matching formula. */
  export function area(shape: Shape): number {
    return shape.size ** 2
  }

  /**
   * Distance around the shape. Squares add up their four sides, circles use the circumference
   * formula with pi taken from Math.PI. The result is not rounded unless asked for, so expect
   * floating point noise on circles. Negative sizes are not checked and give a negative result.
   */
  export function perimeter(shape: Shape, opts: { round?: boolean }): number {
    return opts.round ? Math.round(shape.size * 4) : shape.size * 4
  }

  export type Shape = {
    kind: "square" | "circle"
    size: number
    /** how it is filled */
    fill: string
  }
`

test("writes the comments above their entries", () => {
  const project = createMemoryProject(template)
  const report = applyComments(project, {
    comments: [
      { id: "src/shapes.ts#area", text: "Area of the shape in square units." },
      { id: "src/shapes.ts#perimeter.opts.round", text: "round the result\nto the nearest integer" },
      { id: "src/shapes.ts#Shape", text: "A shape that can be drawn. Only the kinds listed\nare supported." },
      { id: "src/shapes.ts#Shape.kind", text: "which kind of shape this is" },
      { id: "src/shapes.ts#Shape.size", hash: "stale", text: "never written" },
      { id: "src/shapes.ts#Gone", text: "never written" },
    ],
  })

  // area: the /** */ comment is replaced by a /* */ one
  // perimeter.opts.round: shares its line with other code, so the comment goes on one line
  // Shape.size: the hash doesn't match, so it stays without a comment
  // Shape.fill and perimeter: not in the response, left as they were
  expect(project.getSourceFileOrThrow("shapes.ts").getFullText().trim()).toBe(`/* Area of the shape in square units. */
export function area(shape: Shape): number {
  return shape.size ** 2
}

/**
 * Distance around the shape. Squares add up their four sides, circles use the circumference
 * formula with pi taken from Math.PI. The result is not rounded unless asked for, so expect
 * floating point noise on circles. Negative sizes are not checked and give a negative result.
 */
export function perimeter(shape: Shape, opts: { /* round the result to the nearest integer */ round?: boolean }): number {
  return opts.round ? Math.round(shape.size * 4) : shape.size * 4
}

/*
 * A shape that can be drawn. Only the kinds listed
 * are supported.
 */
export type Shape = {
  /* which kind of shape this is */
  kind: "square" | "circle"
  size: number
  /** how it is filled */
  fill: string
}`)

  expect(report).toEqual({
    applied: [
      "src/shapes.ts#area",
      "src/shapes.ts#perimeter.opts.round",
      "src/shapes.ts#Shape",
      "src/shapes.ts#Shape.kind",
    ],
    skipped: [
      "src/shapes.ts#Shape.size: changed since the request",
      "src/shapes.ts#Gone: no such entry",
    ],
    missing: ["src/shapes.ts#Shape.size"],
  })
})

test("leaves nothing to request after a full round trip", () => {
  const project = createMemoryProject(template)
  const request = collectComments(project)
  const text = [
    `nonce ${request.nonce}`,
    ...Object.keys(request.ids).map(n => `@@ ${n}\ncomment number ${n}`),
  ].join("\n\n")

  const report = applyComments(project, parseResponse(text, request))
  expect(report.applied).toHaveLength(Object.keys(request.ids).length)
  expect(report.skipped).toEqual([])
  expect(report.missing).toEqual([])
  expect(collectComments(project).ids).toEqual({}) // perimeter's long comment was replaced by a short one too
})
