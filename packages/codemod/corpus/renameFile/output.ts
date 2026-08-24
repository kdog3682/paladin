/// moved, contents untouched
/* src/core/vmobject.ts */

export class Cobject {
	children: Cobject[] = []
}

/* src/scene.ts */

/// specifier rewritten for the new location
import { Cobject } from "./core/vmobject"

export const roots: Cobject[] = []

/* src/core/camera.ts */

/// now a sibling, so the '../' hop disappears
import type { Cobject } from "./vmobject"

export function focus(target: Cobject) {
	return target.children.length
}
