import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { claude } from "./claude"

const TIMEOUT = 120_000
const scratch = await mkdtemp(join(tmpdir(), "claude-test-"))

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true })
})

test(
  "returns a parsed envelope with text, session, usage and cost",
  async () => {
    const res = await claude({
      model: "haiku",
      prompt: "Reply with exactly the word PONG and nothing else.",
    })

    expect(res.result.trim()).toBe("PONG")
    expect(res.is_error).toBe(false)
    expect(res.subtype).toBe("success")
    expect(res.session_id).toBeString()
    expect(res.total_cost_usd).toBeGreaterThan(0)
    expect(res.usage.input_tokens).toBeGreaterThan(0)
  },
  TIMEOUT
)

test(
  "respects a system prompt",
  async () => {
    const res = await claude({
      model: "haiku",
      systemPrompt:
        "You always answer with a single lowercase word: banana. Nothing else.",
      prompt: "What is the capital of France?",
    })

    expect(res.result.toLowerCase()).toContain("banana")
  },
  TIMEOUT
)

test(
  "resume true continues the previous session",
  async () => {
    const first = await claude({
      model: "haiku",
      prompt: "Remember this number: 4417. Reply with just OK.",
    })

    const second = await claude({
      model: "haiku",
      prompt: "What number did I ask you to remember? Reply with digits only.",
      resume: true,
    })

    expect(second.result).toContain("4417")
    expect(second.session_id).toBe(first.session_id)
  },
  TIMEOUT
)

test(
  "a fresh call starts a new session",
  async () => {
    const first = await claude({
      model: "haiku",
      prompt: "Remember this number: 9312. Reply with just OK.",
      resume: "gamma",
    })

    const second = await claude({
      model: "haiku",
      prompt:
        "Did I give you a number to remember earlier in this conversation? Answer yes or no.",
    })

    expect(second.result).not.toContain("9312")
    expect(second.session_id).not.toBe(first.session_id)
  },
  TIMEOUT
)

test(
  "writes files in cwd without a permission prompt",
  async () => {
    const res = await claude({
      model: "haiku",
      cwd: scratch,
      prompt:
        "Create a file named hello.txt in the current directory containing exactly: hi there",
    })

    expect(res.is_error).toBe(false)
    const written = await Bun.file(join(scratch, "hello.txt")).text()
    expect(written.trim()).toBe("hi there")
  },
  TIMEOUT
)
