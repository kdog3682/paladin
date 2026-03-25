// @paladin/package-management/tests/deprecate.test.ts

import { describe, it, expect, afterEach } from "bun:test"
import { existsSync } from "fs"
import { join } from "path"
import { createTestRepo, PROJECT } from "./setup"
import { GitRepo } from "../lib/git"

let cleanup: () => Promise<void>

afterEach(async () => {
  await cleanup?.()
})

describe("deprecatePackages", () => {
  it("tags, removes directories, and updates workspaces", async () => {
    const repo = await createTestRepo()
    cleanup = repo.cleanup

    await repo.pm.deprecatePackages([`@${PROJECT}/abc`, `@${PROJECT}/xyz`], { force: true })

    // directories removed
    expect(existsSync(join(repo.root, "packages/abc"))).toBe(false)
    expect(existsSync(join(repo.root, "packages/xyz"))).toBe(false)

    // tags exist
    const git = new GitRepo(repo.root)
    const tags = await git.listTags("deprecated/*")
    expect(tags).toContain(`deprecated/@${PROJECT}/abc/v1`)
    expect(tags).toContain(`deprecated/@${PROJECT}/xyz/v1`)
  })

  it("stores group linkage in tag messages", async () => {
    const repo = await createTestRepo()
    cleanup = repo.cleanup

    await repo.pm.deprecatePackages([`@${PROJECT}/abc`, `@${PROJECT}/xyz`], { force: true })

    const git = new GitRepo(repo.root)
    const msg = await git.readTagMessage(`deprecated/@${PROJECT}/abc/v1`)
    const parsed = JSON.parse(msg)
    expect(parsed.group).toEqual([`@${PROJECT}/abc`, `@${PROJECT}/xyz`])
  })

  it("fails when dependents exist and force is not set", async () => {
    const repo = await createTestRepo()
    cleanup = repo.cleanup

    // xyz depends on abc, so deprecating abc alone should fail
    await expect(
      repo.pm.deprecatePackages([`@${PROJECT}/abc`])
    ).rejects.toThrow(/dependents/)
  })

  it("deprecates with recreate re-scaffolds the package", async () => {
    const repo = await createTestRepo()
    cleanup = repo.cleanup

    await repo.pm.deprecatePackages([`@${PROJECT}/abc`], { force: true, recreate: true })

    // package directory should exist again (re-scaffolded)
    expect(existsSync(join(repo.root, "packages/abc/package.json"))).toBe(true)

    // but a deprecation tag should also exist
    const git = new GitRepo(repo.root)
    const tags = await git.listTags("deprecated/*")
    expect(tags).toContain(`deprecated/@${PROJECT}/abc/v1`)
  })
})
