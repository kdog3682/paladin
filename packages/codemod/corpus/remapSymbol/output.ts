/* src/cobject.ts */

/// skipped: this file declares Cobject/CGroup and already imports ./core/vmobject
import { VMobject } from "./core/vmobject"

export class Cobject extends VMobject {}

export class CGroup extends Cobject {
	children: Cobject[] = []
}

/* src/core/vmobject.ts */

/// skipped: the destination file is never rewritten into a self import
export class VMobject {
	points: number[] = []
}

export class VGroup extends VMobject {
	children: VMobject[] = []
}

/* src/scene.ts */

/// VMobject lands first, then VGroup joins the same declaration on the second command
import { VMobject, VGroup } from "./core/vmobject"

export function build(): VMobject {
	return new VGroup()
}

/* src/animate.ts */

/// the alias is kept, so nothing in the body has to move
import { VMobject as Base } from "./core/vmobject"

export function fade(target: Base, amount: number) {
	return { target, amount }
}

/* src/timeline.ts */

/// type-only-ness carries over
import type { VMobject } from "./core/vmobject"

export type Track = { target: VMobject; duration: number }
