/*
- command: docgen, args: [[Rectangle, clamp], { out: docs.md }]
*/

/* src/constants.ts */

export const WIDTH = 48
export const HEIGHT = 24
export const BUFF = 3

/* src/mobject.ts */

export class Mobject {
	moveTo(target: Mobject): this {
		return this
	}

	surround(mobject: Mobject, dimToMatch = 0, stretchToFit = false, buff = 0.25): this {
		return this
	}
}

/* src/shapes.ts */

import { BUFF, HEIGHT, WIDTH } from "./constants"
import { Mobject } from "./mobject"

export interface Style {
	stroke: string | null
	fill: string | null
}

type Styled<T> = T & Partial<Style>

export class Polygon extends Mobject {
	constructor(vertices: number[][], style: Partial<Style> = {}) {
		super()
	}

	roundCorners(radius?: number): this {
		return this
	}
}

/** A rectangle. */
export class Rectangle extends Polygon {
	constructor(opts: Styled<{ width?: number, height?: number }> = {}) {
		const { width = WIDTH, height = HEIGHT, ...style } = opts
		super([], style)
	}

	surround(mobject: Mobject, buff = BUFF): this {
		return this
	}

	stretch(factor: number, axis?: "x" | "y"): this {
		return this
	}
}

export function clamp(value: number, min = 0, max = WIDTH * 2) {
	return Math.min(Math.max(value, min), max)
}
