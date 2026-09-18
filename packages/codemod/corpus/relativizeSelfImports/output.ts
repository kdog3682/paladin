/* package.json */

/// unchanged
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

/// unchanged
export * from "../browser"

/* src/browser/index.ts */

/// unchanged
export * from "./api"

/* src/browser/api.ts */

/// unchanged: relative re-exports are not self-references
export { Grid } from "../grid/grid"
export { Table } from "../grid/table"
export { CGroup, CObject as Mobject } from "../mobject/cobject"
/// note: exports neither Line nor Vect3, so both fall back to package-wide candidates

/* src/geometry/line.ts */

/// unchanged
import type { Vect3 } from "../types"

export class Line {
  constructor(public start: Vect3, public end: Vect3, public opts = {}) {}
}

/* src/markup/layout.ts */

/// unchanged: a second Line candidate. Its probe fails on `new Line(from, to, {...})`
/// (expected 0 arguments, got 3), so it loses to geometry/line.ts
export class Line {
  boxes: unknown[] = []
}

/* src/types.ts */

/// unchanged: the duplicate Vect3 is a pre-existing bug, not the codemod's to fix.
/// Both declarations are in this one file, so they count as a single candidate
export type Vect3 = [number, number, number]

export type Color = string

export type Vect3 = [number, number, number]

/* src/utils/helpers.ts */

/// unchanged: its Vect3 has the same text as the one in types.ts and type-checks equally.
/// types.ts wins the tie because it is imported by more files (geometry/line.ts)
export type Vect3 = [number, number, number]

export const origin: Vect3 = [0, 0, 0]

/* src/math/expr/composites.ts */

/// Line -> geometry/line.ts (fewest type errors), Vect3 -> types.ts (identical, most imported).
/// The inline `type` modifier is kept
import { Line } from "../../geometry/line"
import { type Vect3 } from "../../types"

export function underline(from: Vect3, to: Vect3) {
  return new Line(from, to, { stroke: 2 })
}

/* src/mobject/cobject.ts */

/// unchanged
export class CObject {}

export class CGroup extends CObject {}

/* src/grid/grid.ts */

/// unchanged
import { defaults } from "./defaults"

export class Grid {
  style = defaults
}

/* src/grid/table.ts */

/// unchanged: previously threw "Cannot access 'Grid' before initialization" when
/// reached from grid.ts -> defaults -> markup -> math/expr -> "@mathpen/manim" -> api.ts
import { Grid } from "./grid"

export class Table extends Grid {}

/* src/grid/defaults.ts */

/// unchanged
import { math } from "../markup"

export const defaults = { label: math("x") }

/* src/markup/index.ts */

/// unchanged
export * from "./math"

/* src/markup/math.ts */

/// unchanged
import { Atom } from "../math/expr"

export function math(src: string) {
  return new Atom(src)
}

/* src/math/expr/index.ts */

/// the self re-export now points at the declaring file
export * from "./atom"
export { CGroup } from "../../mobject/cobject"

/* src/math/expr/atom.ts */

/// both names are declared in mobject/cobject.ts, so they merge into one import.
/// Mobject is api.ts's rename of CObject, so it comes back as an alias
import { CGroup, CObject as Mobject } from "../../mobject/cobject"

export class Atom extends CGroup {
  children: Mobject[] = []

  constructor(public src: string) {
    super()
  }
}
