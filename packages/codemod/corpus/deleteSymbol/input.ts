/*
- command: deleteSymbol, args: ['src/abc.ts#ABC']
*/

/* src/types.ts */
export interface Foobar {
	id: string
}

export interface Shared {
	name: string
}

/* src/helpers.ts */
export function helper(value: string) {
	return value.trim()
}

/* src/abc.ts */
import { helper } from './helpers'
import { Foobar } from './types'

const PREFIX = 'abc:'

export function ABC(foo: Foobar) {
	return PREFIX + helper(foo.id)
}

/* src/xyz.ts */
import { helper } from './helpers'
import { Shared } from './types'

export function XYZ(shared: Shared) {
	return helper(shared.name)
}

/* src/index.ts */
export { ABC } from './abc'
export { XYZ } from './xyz'
