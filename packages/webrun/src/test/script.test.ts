import { describe, expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadScript } from "../probe/script"

async function script(yaml: string) {
  const file = join(await mkdtemp(join(tmpdir(), "webrun-script-")), "t.webrun.yaml")
  await writeFile(file, yaml)
  return file
}

describe("loadScript", () => {
  test("resolves app, coerces yaml scalars to the action's type", async () => {
    const s = await loadScript(await script("app: ./App.tsx\nscenarios:\n  - name: a\n    hash: '#x'\n    steps:\n      - type: 5\n      - sleep: 300\n      - eval: 1\n        equals: 1\n"))
    expect(s.app).toMatch(/\/App\.tsx$/)
    expect(s.failOnConsole).toBe(true)
    expect(s.scenarios[0]!.hash).toBe("x")
    expect(s.scenarios[0]!.steps).toEqual([{ type: "5" }, { sleep: 300 }, { eval: "1", equals: 1 }])
  })

  test("a step needs exactly one action and no unknown keys", async () => {
    await expect(loadScript(await script("scenarios:\n  - name: a\n    steps:\n      - equals: 1\n"))).rejects.toThrow(/exactly one action/)
    await expect(loadScript(await script("scenarios:\n  - name: a\n    steps:\n      - click: a\n        eval: b\n"))).rejects.toThrow(/exactly one action/)
    await expect(loadScript(await script("scenarios:\n  - name: a\n    steps:\n      - click: a\n        bogus: 1\n"))).rejects.toThrow(/unknown key bogus/)
  })
})
