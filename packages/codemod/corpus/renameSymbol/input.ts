/*
- command: renameSymbol, args: ['Cobject', 'VMobject']
- command: renameSymbol, args: ['state', 'store', 'src/scene.ts']
*/

/* src/cobject.ts */

export class Cobject {
	children: Cobject[] = []

	add(child: Cobject) {
		this.children.push(child)
	}
}

export function isCobject(value: unknown): value is Cobject {
	return value instanceof Cobject
}

/* src/scene.ts */

import { Cobject } from "./cobject"

const state = { mounted: [] as Cobject[] }

export function mount(object: Cobject) {
	state.mounted.push(object)
}

/* src/render.ts */

import { Cobject, isCobject } from "./cobject"

const state = new WeakMap<Cobject, string>()

export function render(node: Cobject | string): string {
	if (!isCobject(node)) return node

	const cached = state.get(node)
	return cached ?? node.children.map(render).join("")
}
