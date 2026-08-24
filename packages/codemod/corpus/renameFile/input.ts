/*
- command: renameFile, args: ['src/cobject.ts', 'src/core/vmobject.ts']
*/

/* src/cobject.ts */

export class Cobject {
	children: Cobject[] = []
}

/* src/scene.ts */

import { Cobject } from "./cobject"

export const roots: Cobject[] = []

/* src/core/camera.ts */

import type { Cobject } from "../cobject"

export function focus(target: Cobject) {
	return target.children.length
}
