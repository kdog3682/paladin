/* src/basic.ts */

/// the modifier moves onto each declaration, in any declaration kind
export const count = 1

export function increment() {
  return count + 1
}

export class Counter {}

/// the emptied `export { ... }` statement is removed

/* src/types.ts */

/// `export type { Props }` inlines because the target is already type-only
export interface Props {
  id: string
}
/// same for an inline `type` specifier on a type alias

export type Config = {
  debug: boolean
}

export enum Level {
  Low,
  High,
}

/* src/aliases.ts */

/// `internal` is aliased, so it is left in place
const internal = "value"
export const other = "other"
/// the statement survives with only the aliased specifier left

export { internal as external }
/// default exports are never touched
export default other

/* src/variables.ts */

/// every name in the statement is exported, so the modifier can be inlined
export const a = 1, b = 2
/// only `c` is exported here, inlining would leak `d`, so nothing changes
const c = 3, d = 4

export { c }

/* src/helpers.ts */

/// already inline, unchanged
export function helper() {}

/* src/other.ts */

export const flag = true

/* src/thing.ts */

export const thing = "thing"

/* src/re-exports.ts */

import { helper } from "./helpers"
/// `helper` resolves to an import specifier, which cannot carry a modifier

export { helper }
/// anything with a module specifier is skipped
export { thing } from "./thing"
export * from "./other"
