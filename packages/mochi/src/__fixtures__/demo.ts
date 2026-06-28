import { add, slugify, formatDate, createUser } from "./utils"

/* math */

// basic addition
console.log(add(1, 2))
console.log(add(-1, 1))

// handles floats
console.log(add(0.1, 0.2))

/* strings */

console.log(slugify("Hello World"))
console.log(slugify("  trim me  "))

// no result expected — just runs
formatDate("2024-01-01")

// ==== pipeline ====

// chained: declare then use
const user = createUser({ name: "kai" })
console.log(formatDate(user.createdAt))

// ----
// edge cases
// ----

console.log(add(0, 0))
console.log(slugify(""))

/** jsdoc section */

// returns undefined for unknown input
console.log(formatDate(null))
