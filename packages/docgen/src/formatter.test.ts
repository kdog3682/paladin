// @paladin/codeform/formatter.test.ts

import { test, expect } from "bun:test"
import { parseSource } from "./parseFile"
import { format } from "./formatter"

const ROOT = "/home/kdog3682/projects/paladin/packages/utils/src"

const geometry = `
export interface Point {
  x: number
  y: number
  label?: string
}

export interface Rect {
  origin: Point
  width: number
  height: number
}

export type Vec = [number, number]

export enum Axis {
  X,
  Y,
  Z,
}

export type Shape =
  | { kind: "circle"; center: Point; radius: number }
  | { kind: "rect"; bounds: Rect }

export type Transform = (p: Point) => Point

/** Euclidean distance between two points. */
export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

export function translate(p: Point, v: Vec): Point {
  return { x: p.x + v[0], y: p.y + v[1] }
}

export async function loadShapes(url: string): Promise<Shape[]> {
  const res = await fetch(url)
  return res.json()
}

const INTERNAL_EPSILON = 1e-9

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < INTERNAL_EPSILON
}

/** Mutable path builder. */
export class Path {
  private points: Point[] = []
  static readonly MAX = 1000

  constructor(start?: Point) {
    if (start) this.points.push(start)
  }

  get length(): number {
    return this.points.length
  }

  add(p: Point): this {
    this.points.push(p)
    return this
  }

  static fromRect(r: Rect): Path {
    const p = new Path(r.origin)
    return p
  }

  async render(t: Transform): Promise<Point[]> {
    return this.points.map(t)
  }

  private isClosed(): boolean {
    const { points } = this
    if (points.length < 2) return false
    return nearlyEqual(points[0].x, points[points.length - 1].x)
  }
}

interface NotExported {
  hidden: boolean
}
`

// render.ts imports Point + Shape, making them shared (hoisted).
const render = `
import { Point, Shape } from "@paladin/utils/geometry"

export function draw(shapes: Shape[]): Point[] {
  return shapes.map((s) => (s.kind === "circle" ? s.center : s.bounds.origin))
}
`

test("format snapshot", () => {
  const files = [
    parseSource(geometry, `${ROOT}/geometry.ts`),
    parseSource(render, `${ROOT}/render.ts`),
  ]
  expect(format(files)).toMatchSnapshot()
})

// formatted one file at a time: nothing is shared, so every type
// (Point, Rect, Vec, Axis, Shape, Transform) shows in geometry's own section.
test("format snapshot (one at a time)", () => {
  const files = [
    parseSource(geometry, `${ROOT}/geometry.ts`),
    parseSource(render, `${ROOT}/render.ts`),
  ]
  const out = files.map((f) => format(f)).join("\n")
  expect(out).toMatchSnapshot()
})