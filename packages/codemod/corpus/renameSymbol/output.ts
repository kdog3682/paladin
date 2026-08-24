/* src/cobject.ts */

/// the file itself is not renamed, only the symbol
export class VMobject {
	children: VMobject[] = []

	add(child: VMobject) {
		this.children.push(child)
	}
}

/// isCobject merely contains the old name, it is a different symbol and is left alone
export function isCobject(value: unknown): value is VMobject {
	return value instanceof VMobject
}

/* src/scene.ts */

import { VMobject } from "./cobject"

/// 'state' exists in two files, so the third arg picks this one
const store = { mounted: [] as VMobject[] }

export function mount(object: VMobject) {
	store.mounted.push(object)
}

/* src/render.ts */

import { VMobject, isCobject } from "./cobject"

/// untouched: renaming 'state' without the file arg would have thrown as ambiguous
const state = new WeakMap<VMobject, string>()

export function render(node: VMobject | string): string {
	if (!isCobject(node)) return node

	const cached = state.get(node)
	return cached ?? node.children.map(render).join("")
}
