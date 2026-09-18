/* src/vmobject.ts */

/// untouched
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

/// src/cobject.ts is deleted
/// the words to rewrite are read off the barrel: Cobject -> VMobject, CGroup -> VGroup,
/// and cobject -> vmobject from the file names, since every re-export came from one file

/* src/scene.ts */

/// both value imports collapse into one declaration on ./vmobject
import { VMobject, VGroup } from "./vmobject"
/// the type-only declaration stays a type-only declaration
import type { Style } from "./vmobject"

/// comment text is rewritten, case preserved
// every VMobject inside a VGroup shares the group style
export function group(items: VMobject[], style: Style): VGroup {
  const group = new VGroup()
  group.children = items
  group.style = style
  return group
}

/// shorthand properties keep their runtime keys
export const registry = { Cobject: VMobject, CGroup: VGroup }
/// strings are rewritten
export const kind = "vmobject"
/// the identifier COBJECT_KIND is code, not text, so it is left alone
export const COBJECT_KIND = `VMOBJECT:${"vgroup"}`

/// camelCase and plurals inside jsdoc: cGroup -> vGroup, cobjects -> vmobjects, makeCobject -> makeVMobject
/** builds a vGroup from loose vmobjects, see makeVMobject */
export function makeGroup(): VGroup {
  return group([new VMobject()], {})
}

/* src/shapes.ts */

/// the existing VMobject binding is reused instead of adding a second one
import { VMobject, type Stroke } from "./vmobject"

export const thin: Stroke = { width: 1, color: "black" }

export function outline(target: VMobject): VMobject {
  target.style.stroke = thin
  return target
}

/* src/mixed.ts */

/// the `type VMobject` binding is reused, but widened to a value first: the redirected
/// Cobject is constructed, and a type-only binding cannot carry that
import { VMobject } from "./vmobject"

export const items: VMobject[] = []

export function spawn(): VMobject {
  return new VMobject()
}

/* src/aliased.ts */

/// the importer's own alias is kept, so no references change
import { VMobject as Shape, type DashSpec } from "./vmobject"

export const dashed: DashSpec = "dashed"
export const shapes: Shape[] = []

/* src/index.ts */

/// re-exports move to ./vmobject under the real names
export { VMobject, VGroup } from "./vmobject"
export type { Style } from "./vmobject"
export { group } from "./scene"

/* src/app.ts */

/// index now exports VMobject, so the import through index is renamed in place
import { VMobject, type Style } from "./index"
/// namespace import is repointed, its identifier `cobjects` is code and left alone
import * as cobjects from "./vmobject"

export function make(style: Style) {
  const shape = new VMobject()
  shape.style = style
  return new cobjects.VGroup()
}

/// local re-export follows the rename, which carries on to main.ts
export { VMobject }

/* src/main.ts */

import { VMobject } from "./app"

console.log(new VMobject(), "made a VMobject")
