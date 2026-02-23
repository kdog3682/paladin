// @paladin/ai/omni/index.ts

import { runAgent } from "./agent"
import type { OmniOptions } from "./types"

export type { OmniOptions }
export { runAgent }

export async function omni(
  prompt: string,
  opts: OmniOptions = {}
): Promise<string> {
  const verbose = opts.verbose ?? true
  if (verbose) console.log(`\n🔮 omni: "${prompt.slice(0, 100)}${prompt.length > 100 ? "..." : ""}"`)
  return runAgent(prompt, { ...opts, verbose })
}

if (import.meta.main) {
  const prompt = process.argv.slice(2).join(" ")
  if (!prompt) {
    console.error("Usage: bun run @paladin/ai/omni <prompt>")
    process.exit(1)
  }
  omni(prompt).then((result) => {
    console.log("\n✅ Done\n")
    console.log(result)
  })
}
