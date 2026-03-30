// @paladin/ai/claude/claude.test.ts

import { describe, test, expect } from "bun:test"
import { claude } from "@paladin/ai/claude"

const model = "claude-haiku-4-5-20251001"

describe("claude", () => {
  test("basic prompt", async () => {
    const result = await claude({
      prompt: "Reply with just the word 'hello'.",
      model,
    })
    expect(result.toLowerCase()).toContain("hello")
  })

  test("system prompt", async () => {
    const result = await claude({
      prompt: "Hi",
      systemPrompt: "You are a pirate. Reply in 5 words or less.",
      model,
    })
    expect(result.length).toBeGreaterThan(0)
  })

  test("auto resume carries context", async () => {
    const r1 = await claude({
      prompt: "Remember the word 'banana'. Reply OK.",
      model,
    }, null)

    expect(r1.toLowerCase()).toContain("ok")

    const r2 = await claude({
      prompt: "What word did I say? Reply with just the word.",
      model,
    }, "auto")

    expect(r2.toLowerCase()).toContain("banana")
  })
})
