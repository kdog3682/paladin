/* package.json */

{
  "name": "@mathpen/manim",
  "exports": {
    ".": {
      "node": "./src/node/index.ts",
      "default": "./src/browser/index.ts"
    }
  }
}

/* src/node/index.ts */

export * from "../browser"

/* src/browser/index.ts */

export * from "./api"

/* src/browser/api.ts */

export { Grid } from "../grid/grid"
export { Table } from "../grid/table"
export { CGroup, CObject as Mobject } from "../mobject/cobject"

/* src/geometry/line.ts */

import type { Vect3 } from "../types"

export class Line {
  constructor(public start: Vect3, public end: Vect3, public opts = {}) {}
}

/* src/markup/layout.ts */

export class Line {
  boxes: unknown[] = []
}

/* src/types.ts */

export type Vect3 = [number, number, number]

export type Color = string

export type Vect3 = [number, number, number]

/* src/utils/helpers.ts */

export type Vect3 = [number, number, number]

export const origin: Vect3 = [0, 0, 0]

/* src/math/expr/composites.ts */

import { Line, type Vect3 } from "@mathpen/manim"

export function underline(from: Vect3, to: Vect3) {
  return new Line(from, to, { stroke: 2 })
}

/* src/mobject/cobject.ts */

export class CObject {}

export class CGroup extends CObject {}

/* src/grid/grid.ts */

import { defaults } from "./defaults"

export class Grid {
  style = defaults
}

/* src/grid/table.ts */

import { Grid } from "./grid"

export class Table extends Grid {}

/* src/grid/defaults.ts */

import { math } from "../markup"

export const defaults = { label: math("x") }

/* src/markup/index.ts */

export * from "./math"

/* src/markup/math.ts */

import { Atom } from "../math/expr"

export function math(src: string) {
  return new Atom(src)
}

/* src/math/expr/index.ts */

export * from "./atom"
export { CGroup } from "@mathpen/manim"

/* src/math/expr/atom.ts */

import { CGroup, Mobject } from "@mathpen/manim"

export class Atom extends CGroup {
  children: Mobject[] = []

  constructor(public src: string) {
    super()
  }
}
