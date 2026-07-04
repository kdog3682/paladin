import { expect, test } from "bun:test"
import { askData } from "./ask"

test("deepseek returns structured data", async () => {
  const { sum } = await askData<{ sum: number }>(
    "Return the sum of 1 and 1 as { sum }.",
    { provider: "deepseek" }
  )
  expect(sum).toBe(2)
})
