import { expect, test } from "bun:test"
import { getUsage } from "./claudeCode"

// The json envelope from `claude -p ... --output-format json` looks roughly like:
// { type, subtype, result, total_cost_usd, usage: { input_tokens, output_tokens, ... }, ... }
type UsageEnvelope = {
  result?: string
  total_cost_usd?: number
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
  [k: string]: unknown
}

test("/usage reports cost/token footprint", async () => {
  const raw = await getUsage()
  console.log("raw:", raw)

  let parsed: UsageEnvelope
  try {
    parsed = JSON.parse(raw)
  } catch {
    // /usage may not return the standard json envelope in print mode
    console.warn("non-json output — /usage likely handled locally, not via API")
    return
  }

  const cost = parsed.total_cost_usd ?? 0
  const inTok = parsed.usage?.input_tokens ?? 0
  const outTok = parsed.usage?.output_tokens ?? 0
  console.log({ cost, inTok, outTok })

  // Hypothesis: /usage is a local command and shouldn't bill tokens.
  // Left as an expectation so a nonzero cost surfaces loudly instead of passing silently.
  expect(cost).toBe(0)
}, 60_000)
