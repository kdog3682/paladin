import { describe, expect, test } from "bun:test"
import { bootstrap, parseTemplate } from "./index"

describe("parseTemplate", () => {
  test("ignores preamble comments and parses path/content pairs", () => {
    const raw = `// preamble
// notes

==========
file-a.txt
==========
hello
world
==========
dir/file-b.txt
==========
{
  "ok": true
}
==========`

    expect(parseTemplate(raw)).toEqual([
      { path: "file-a.txt", content: "hello\nworld" },
      { path: "dir/file-b.txt", content: '{\n  "ok": true\n}' },
    ])
  })
})

describe("bootstrap", () => {
  test("falls back to default template when inferred key is missing", async () => {
    const ops = await bootstrap({
      dir: "/tmp/testproj/packages/api",
      projectName: "testproj",
      packageName: "api",
      key: "hono",
    })

    const paths = ops.map(op => op.kind === "write" ? op.path : "")
    expect(paths).toContain("/tmp/testproj/packages/api/package.json")
    expect(paths).toContain("/tmp/testproj/packages/api/tsconfig.json")
  })
})
