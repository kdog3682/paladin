/// deleted files: src/abc.ts
/// ABC went away, PREFIX had no other user, and the two remaining imports bound
/// nothing — so the file had nothing left to keep.

/* src/types.ts */
/// Foobar is gone: ABC was its only user, and abc.ts's import of it was the only
/// reference that remained
export interface Shared {
	name: string
}

/* src/helpers.ts */
/// untouched: helper is still called by XYZ, so only abc.ts's import of it is
/// dropped
export function helper(value: string) {
	return value.trim()
}

/* src/xyz.ts */
import { helper } from './helpers'
import { Shared } from './types'

export function XYZ(shared: Shared) {
	return helper(shared.name)
}

/* src/index.ts */
/// the re-export of ABC is removed with its whole export declaration; this file
/// still has a statement, so it survives
export { XYZ } from './xyz'
