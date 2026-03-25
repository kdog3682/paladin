// @paladin/package-management/tests/restore.test.ts

import { describe, it, expect, afterEach } from "bun:test"
import { existsSync } from "fs"
import { readFile } from "fs/promises"
import { join } from "path"
import { createTestRepo, PROJECT } from "./setup"
import { GitRepo } from "../lib/git"

let cleanup: () => Promise<void>

afterEach(async () => {
  await cleanup?.()
})

describe("restorePackages", () => {
  it("fails without explicit linked/solo when package was part of a group", async () => {
    const repo = await createTestRepo()
    cleanup = repo.cleanup

    await repo.pm.deprecatePackages([`@${PROJECT}/abc`, `@${PROJECT}/xyz`], { force: true })

    await expect(
      repo.pm.restorePackages([`@${PROJECT}/xyz`], "v1")
    ).rejects.toThrow(/group/)
  })

  it("restores all group members when linked: true", async () => {
    const repo = await createTestRepo()
    cleanup = repo.cleanup

    await repo.pm.deprecatePackages([`@${PROJECT}/abc`, `@${PROJECT}/xyz`], { force: true })

    await repo.pm.restorePackages([`@${PROJECT}/xyz`], "v1", { linked: true })

    expect(existsSync(join(repo.root, "packages/abc/package.json"))).toBe(true)
    expect(existsSync(join(repo.root, "packages/xyz/package.json"))).toBe(true)
  })

  it("restores only the requested package when linked: false", async () => {
    const repo = await createTestRepo()
    cleanup = repo.cleanup

    await repo.pm.deprecatePackages([`@${PROJECT}/abc`, `@${PROJECT}/xyz`], { force: true })

    await repo.pm.restorePackages([`@${PROJECT}/xyz`], "v1", { linked: false })

    expect(existsSync(join(repo.root, "packages/xyz/package.json"))).toBe(true)
    expect(existsSync(join(repo.root, "packages/abc/package.json"))).toBe(false)
  })

  it("bumps the version in the restored package", async () => {
    const repo = await createTestRepo()
    cleanup = repo.cleanup

    await repo.pm.deprecatePackages([`@${PROJECT}/abc`], { force: true })
    await repo.pm.restorePackages([`@${PROJECT}/abc`], "v1", { linked: false })

    const pkg = JSON.parse(
      await readFile(join(repo.root, "packages/abc/package.json"), "utf-8")
    )
    // original was 1.0.0 but scaffold creates 0.1.0, bumped to 0.2.0
    expect(pkg.version).not.toBe("1.0.0")
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("creates a new deprecation tag noting the restored-from source", async () => {
    const repo = await createTestRepo()
    cleanup = repo.cleanup

    await repo.pm.deprecatePackages([`@${PROJECT}/abc`], { force: true })
    await repo.pm.restorePackages([`@${PROJECT}/abc`], "v1", { linked: false })

    const git = new GitRepo(repo.root)
    const tags = await git.listTags(`deprecated/@${PROJECT}/abc/*`)
    // v1 from deprecation, v2 from restore
    expect(tags.length).toBe(2)

    const msg = await git.readTagMessage(`deprecated/@${PROJECT}/abc/v2`)
    const parsed = JSON.parse(msg)
    expect(parsed.restoredFrom).toBe(`deprecated/@${PROJECT}/abc/v1`)
  })

  it("commit message references the source tag", async () => {
    const repo = await createTestRepo()
    cleanup = repo.cleanup

    await repo.pm.deprecatePackages([`@${PROJECT}/abc`], { force: true })
    await repo.pm.restorePackages([`@${PROJECT}/abc`], "v1", { linked: false })

    const git = new GitRepo(repo.root)
    // read last commit message
    const proc = Bun.spawn(["git", "log", "-1", "--format=%s"], {
      cwd: repo.root,
      stdout: "pipe",
    })
    const msg = await new Response(proc.stdout).text()
    expect(msg.trim()).toContain(`deprecated/@${PROJECT}/abc/v1`)
  })
})
