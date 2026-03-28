// @paladin/squire/src/test/shell/git.test.ts

import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { join } from "path"
import { mkdirSync, rmSync } from "fs"
import { GitOps } from "../../shell/git"

const TMP = join(import.meta.dir, ".tmp-git-test")

async function run(args: string[]) {
  const proc = Bun.spawn(args, { cwd: TMP, stdout: "pipe", stderr: "pipe" })
  await proc.exited
}

beforeAll(async () => {
  mkdirSync(TMP, { recursive: true })
  await run(["git", "init"])
  await run(["git", "config", "user.email", "test@test.com"])
  await run(["git", "config", "user.name", "test"])
  await Bun.write(join(TMP, "a.txt"), "hello")
  await run(["git", "add", "."])
  await run(["git", "commit", "-m", "init"])
})

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
})

describe("GitOps", () => {
  test("commit and log round-trip", async () => {
    const git = new GitOps(TMP)

    await Bun.write(join(TMP, "b.txt"), "world")
    await git.add(["."])
    await git.commit("wip(demo): v1 -- first pass")

    const history = await git.wipHistory("demo")
    expect(history.length).toBe(1)
    expect(history[0].version).toBe(1)
    expect(history[0].message).toBe("first pass")
    expect(history[0].hash).toBeTruthy()
  })

  test("restore reverts file content", async () => {
    const git = new GitOps(TMP)
    const filePath = join(TMP, "b.txt")

    const history = await git.wipHistory("demo")
    const hash = history[0].hash!

    await Bun.write(filePath, "changed")
    await git.add(["."])
    await git.commit("wip(demo): v2 -- changed")

    await git.restore(hash, [filePath])
    const content = await Bun.file(filePath).text()
    expect(content).toBe("world")
  })

  test("dirtyFiles detects changes", async () => {
    const git = new GitOps(TMP)
    await Bun.write(join(TMP, "c.txt"), "new")

    const dirty = await git.dirtyFiles(["."])
    expect(dirty.some(f => f.includes("c.txt"))).toBe(true)
  })
})
