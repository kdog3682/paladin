// @paladin/fcache/fcache.mochi.ts
import { stamp } from "@paladin/stamp"
import { fcache } from "./index"
import { readFileSync } from "fs"

const FIXTURES = `
===
fixtures/sample.json
===
{ "name": "alice", "score": 42 }

===
fixtures/greeting.txt
===
hello world
`

const paths = stamp(FIXTURES)
const jsonPath = paths[0]
const txtPath = paths[1]

/* caches a JSON parse — returns object, auto-coerced via json serializer */
export function exampleJsonParse() {
  const parseJson = fcache(function parseJson(file: string) {
    console.log("  -> running expensive parseJson")
    return JSON.parse(readFileSync(file, "utf-8"))
  })

  return parseJson(jsonPath)
}

/* caches a string transform — returns string, passthrough coercion */
export function exampleStringTransform() {
  const shout = fcache(function shout(file: string) {
    console.log("  -> running expensive shout")
    return readFileSync(file, "utf-8").toUpperCase().trim()
  })

  return shout(txtPath)
}

/* caches a numeric computation — returns number, auto-coerced */
export function exampleLineCount() {
  const countLines = fcache(function countLines(file: string) {
    console.log("  -> running expensive countLines")
    return readFileSync(file, "utf-8").split("\n").length
  })

  return countLines(txtPath)
}

/* second call should hit cache — no "running expensive" log */
export async function exampleCacheHit() {
  const parseJson = fcache(function parseJson(file: string) {
    console.log("  -> running expensive parseJson")
    return JSON.parse(readFileSync(file, "utf-8"))
  })

  const first = await parseJson(jsonPath)
  const second = await parseJson(jsonPath)
  return { first, second, same: JSON.stringify(first) === JSON.stringify(second) }
}
