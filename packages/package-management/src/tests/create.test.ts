// @paladin/package-management/tests/create.test.ts

import { describe, it, expect, afterEach } from "bun:test"
import { existsSync } from "fs"
import { join } from "path"
import { createTestRepo, PROJECT } from "./setup"

let cleanup: () => Promise<void>

afterEach(async () => {
  await cleanup?.()
})

describe("createPackage", () => {
  it("scaffolds a new package directory", async () => {
    const repo = await createTestRepo()
    cleanup = repo.cleanup

    const files = await repo.pm.createPackage(`@${PROJECT}/new-ui`)

    expect(files.length).toBeGreaterThan(0)
    expect(existsSync(join(repo.root, "packages/new-ui/package.json"))).toBe(true)
  })

  it("fails if deprecation tags already exist for the package name", async () => {
    const repo = await createTestRepo()
    cleanup = repo.cleanup

    await repo.pm.deprecatePackages([`@${PROJECT}/abc`], { force: true })

    await expect(
      repo.pm.createPackage(`@${PROJECT}/abc`)
    ).rejects.toThrow(/tags exist/)
  })
})
