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
