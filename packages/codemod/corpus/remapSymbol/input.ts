/*
- command: remapSymbol, args: ['Cobject', 'VMobject']
- command: remapSymbol, args: ['CGroup', 'VGroup']
*/

/* src/cobject.ts */

import { VMobject } from "./core/vmobject"

export class Cobject extends VMobject {}

export class CGroup extends Cobject {
	children: Cobject[] = []
}

/* src/core/vmobject.ts */

export class VMobject {
	points: number[] = []
}

export class VGroup extends VMobject {
	children: VMobject[] = []
}

/* src/scene.ts */

import { CGroup, Cobject } from "./cobject"

export function build(): Cobject {
	return new CGroup()
}

/* src/animate.ts */

import { Cobject as Base } from "./cobject"

export function fade(target: Base, amount: number) {
	return { target, amount }
}

/* src/timeline.ts */

import type { Cobject } from "./cobject"

export type Track = { target: Cobject; duration: number }
