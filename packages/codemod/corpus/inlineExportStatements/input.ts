/* src/basic.ts */

const count = 1

function increment() {
  return count + 1
}

class Counter {}

export { count, increment, Counter }

/* src/types.ts */

interface Props {
  id: string
}

type Config = {
  debug: boolean
}

enum Level {
  Low,
  High,
}

export type { Props }
export { type Config, Level }

/* src/aliases.ts */

const internal = "value"
const other = "other"

export { internal as external, other }
export default other

/* src/variables.ts */

const a = 1, b = 2
const c = 3, d = 4

export { a, b }
export { c }

/* src/helpers.ts */

export function helper() {}

/* src/other.ts */

export const flag = true

/* src/thing.ts */

export const thing = "thing"

/* src/re-exports.ts */

import { helper } from "./helpers"

export { helper }
export { thing } from "./thing"
export * from "./other"
