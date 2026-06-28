import { test, expect } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import { parseMochiFile } from "./parser"

test("parseMochiFile fixture", () => {
  const fixturePath = join(import.meta.dir, "__fixtures__/demo.ts")
  const source = readFileSync(fixturePath, "utf-8")
  const file = parseMochiFile(source, "demo.ts")
  expect(file).toMatchSnapshot()
})
