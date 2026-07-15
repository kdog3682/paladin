import {test, expect} from "bun:test"
import {tml} from "./tml"

// input string → output string
const cases: [string, string][] = [
  ["2t3p4-5=6", "2 × 3 + 4 - 5 = 6"],
  ["2e2t[2e3t2e-5]", "2^2 × [2^3 × 2^-5]"],
  ["3x2p3xy2", "3x^2 + 3xy^2"],
  ["4/5d5/6", "4/5 ÷ 5/6"],
  ["3d5-4d[6]p2t3", "3 ÷ 5 - 4 ÷ [6] + 2 × 3"],
  ["3e[7]", "3^[7]"],
  ["3ee5", "300000"],
  ["3e2px5-6", "3^2 + x^5 - 6"],
  ["3e2px^(5-6)", "3^2 + x^(5 - 6)"],
  ["2ee3", "2000"],
  ["apb=", "a + b = ?"],
]

for (const [input, expected] of cases) {
  test(`${input} → ${expected}`, () => {
    expect(tml(input)).toBe(expected)
  })
}
