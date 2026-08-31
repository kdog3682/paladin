import { expect, test } from "bun:test"
import { quickParse } from "./quick-parse"

test("collapses const/function/class into symbols and keeps types separate", () => {
  const parsed = quickParse(`
export function foo() {}
class Bar {}
export const baz = 1
let qux = 2
export interface Shape {}
`)

  expect(parsed.symbols).toEqual([
    { name: "foo", text: "export function foo() {}", exported: true, kind: "function" },
    { name: "Bar", text: "class Bar {}", exported: false, kind: "class" },
    { name: "baz", text: "export const baz = 1", exported: true, kind: "const" },
    { name: "qux", text: "let qux = 2", exported: false, kind: "const" },
  ])
  expect(parsed.types).toEqual([
    { name: "Shape", text: "export interface Shape {}", exported: true },
  ])
})

test("export clause marks matching symbols exported", () => {
  const parsed = quickParse(`
function foo() {}
const bar = 1
export { foo, bar as baz }
`)

  expect(parsed.symbols.map(s => [s.name, s.exported])).toEqual([
    ["foo", true],
    ["bar", true],
  ])
})
