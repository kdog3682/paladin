// @paladin/package-management/tests/retrieve.test.ts

import { describe, it, expect, afterEach } from "bun:test"
import { createTestRepo, PROJECT } from "./setup"

let cleanup: () => Promise<void>

afterEach(async () => {
  await cleanup?.()
})

describe("retrievePackage", () => {
  it("returns full snapshot with files for a specific version", async () => {
    const repo = await createTestRepo()
    cleanup = repo.cleanup

    await repo.pm.deprecatePackages([`@${PROJECT}/abc`], { force: true })

    const snapshot = await repo.pm.retrievePackage(`@${PROJECT}/abc`, "v1")
    expect(snapshot.packageName).toBe(`@${PROJECT}/abc`)
    expect(snapshot.version).toBe(1)
    expect(snapshot.tag).toBe(`deprecated/@${PROJECT}/abc/v1`)
    expect(snapshot.files.length).toBeGreaterThan(0)

    const pkgJson = snapshot.files.find(f => f.path.endsWith("package.json"))
    expect(pkgJson).toBeDefined()
  })

  it("resolves 'latest' to the highest version", async () => {
    const repo = await createTestRepo()
    cleanup = repo.cleanup

    // deprecate twice to create v1 and v2
    await repo.pm.deprecatePackages([`@${PROJECT}/abc`], { force: true, recreate: true })
    await repo.pm.deprecatePackages([`@${PROJECT}/abc`], { force: true })

    const snapshot = await repo.pm.retrievePackage(`@${PROJECT}/abc`, "latest")
    expect(snapshot.version).toBe(2)
  })

  it("throws for a non-existent version", async () => {
    const repo = await createTestRepo()
    cleanup = repo.cleanup

    await expect(
      repo.pm.retrievePackage(`@${PROJECT}/abc`, "v99")
    ).rejects.toThrow(/No tag found/)
  })
})

describe("inspectPackage", () => {
  it("returns metadata without file contents", async () => {
    const repo = await createTestRepo()
    cleanup = repo.cleanup

    await repo.pm.deprecatePackages([`@${PROJECT}/abc`], { force: true })

    const meta = await repo.pm.inspectPackage(`@${PROJECT}/abc`, "v1")
    expect(meta.packageName).toBe(`@${PROJECT}/abc`)
    expect(meta.fileCount).toBeGreaterThan(0)
    expect((meta as any).files).toBeUndefined()
  })
})
