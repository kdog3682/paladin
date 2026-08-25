import { expect, test } from "bun:test"
import { ask } from "./ask"

test("glm answers 1 + 1", async () => {
  const text = await ask("1 + 1 = ? Reply with only the number.", {
    provider: "glm",
  })
  expect(text).toContain("2")
})

test("deepseek answers 1 + 1", async () => {
  const text = await ask("1 + 1 = ? Reply with only the number.", {
    provider: "deepseek",
  })
  expect(text).toContain("2")
})

test("deepseek returns structured data", async () => {
  const { sum } = await ask<{ sum: number }>(
    "Return the sum of 1 and 1 as { sum }.",
    { provider: "deepseek" }
  )
  expect(sum).toBe(2)
})
