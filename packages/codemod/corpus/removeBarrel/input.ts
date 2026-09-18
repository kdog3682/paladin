/*
- command: removeBarrel, args: ['src/cobject.ts']
*/

/* src/vmobject.ts */

export type DashName = "solid" | "dashed"
export type Dash = { name: DashName, gap: number }
export type DashSpec = DashName | Dash
export type Stroke = { width: number, color: string }
export type Style = { stroke?: Stroke, dash?: DashSpec }

export class VMobject {
  style: Style = {}
}

export class VGroup extends VMobject {
  children: VMobject[] = []
}

/* src/cobject.ts */

export { VMobject as Cobject, VGroup as CGroup } from "./vmobject"
export type { DashName, DashSpec, Dash, Stroke, Style } from "./vmobject"

/* src/scene.ts */

import { Cobject, CGroup } from "./cobject"
import type { Style } from "./cobject"

// every Cobject inside a CGroup shares the group style
export function group(items: Cobject[], style: Style): CGroup {
  const group = new CGroup()
  group.children = items
  group.style = style
  return group
}

export const registry = { Cobject, CGroup }
export const kind = "cobject"
export const COBJECT_KIND = `COBJECT:${"cgroup"}`

/** builds a cGroup from loose cobjects, see makeCobject */
export function makeGroup(): CGroup {
  return group([new Cobject()], {})
}

/* src/shapes.ts */

import { VMobject } from "./vmobject"
import { Cobject, type Stroke } from "./cobject"

export const thin: Stroke = { width: 1, color: "black" }

export function outline(target: Cobject): VMobject {
  target.style.stroke = thin
  return target
}

/* src/mixed.ts */

import { type VMobject } from "./vmobject"
import { Cobject } from "./cobject"

export const items: VMobject[] = []

export function spawn(): Cobject {
  return new Cobject()
}

/* src/aliased.ts */

import { Cobject as Shape, type DashSpec } from "./cobject"

export const dashed: DashSpec = "dashed"
export const shapes: Shape[] = []

/* src/index.ts */

export { Cobject, CGroup } from "./cobject"
export type { Style } from "./cobject"
export { group } from "./scene"

/* src/app.ts */

import { Cobject, type Style } from "./index"
import * as cobjects from "./cobject"

export function make(style: Style) {
  const shape = new Cobject()
  shape.style = style
  return new cobjects.CGroup()
}

export { Cobject }

/* src/main.ts */

import { Cobject } from "./app"

console.log(new Cobject(), "made a Cobject")
