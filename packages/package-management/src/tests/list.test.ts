// @paladin/package-management/tests/list.test.ts

import { describe, it, expect, afterEach } from "bun:test"
import { createTestRepo, PROJECT } from "./setup"

let cleanup: () => Promise<void>

afterEach(async () => {
  await cleanup?.()
})

describe("listDeprecated", () => {
  it("returns empty when no packages are deprecated", async () => {
    const repo = await createTestRepo()
    cleanup = repo.cleanup

    const result = await repo.pm.listDeprecated()
    expect(result).toEqual([])
  })

  it("returns all deprecated packages with versions and groups", async () => {
    const repo = await createTestRepo()
    cleanup = repo.cleanup

    await repo.pm.deprecatePackages([`@${PROJECT}/abc`, `@${PROJECT}/xyz`], { force: true })

    const result = await repo.pm.listDeprecated()
    expect(result.length).toBe(2)

    const abc = result.find(r => r.packageName === `@${PROJECT}/abc`)
    expect(abc).toBeDefined()
    expect(abc!.versions).toEqual([1])
    expect(abc!.latestGroup).toContain(`@${PROJECT}/abc`)
    expect(abc!.latestGroup).toContain(`@${PROJECT}/xyz`)
  })

  it("tracks multiple versions after repeated deprecations", async () => {
    const repo = await createTestRepo()
    cleanup = repo.cleanup

    await repo.pm.deprecatePackages([`@${PROJECT}/abc`], { force: true, recreate: true })
    await repo.pm.deprecatePackages([`@${PROJECT}/abc`], { force: true })

    const result = await repo.pm.listDeprecated()
    const abc = result.find(r => r.packageName === `@${PROJECT}/abc`)
    expect(abc!.versions).toEqual([1, 2])
  })
})
