// @paladin/fcache/fcache.demo.ts
import {
  exampleJsonParse,
  exampleStringTransform,
  exampleLineCount,
  exampleCacheHit,
} from "./fcache.mochi"

async function main() {
  console.log("fcache demo\n")
  console.log("=== exampleJsonParse ===")
  console.log(await exampleJsonParse())

  console.log("\n=== exampleStringTransform ===")
  console.log(await exampleStringTransform())

  console.log("\n=== exampleLineCount ===")
  console.log(await exampleLineCount())

  console.log("\n=== exampleCacheHit (second call should be cached) ===")
  console.log(await exampleCacheHit())
}

main()
