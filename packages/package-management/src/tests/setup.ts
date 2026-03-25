// @paladin/package-management/tests/setup.ts

import { mkdtemp, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { PackageManager } from "../package-management"
import { hydrate } from "../lib/scaffold"

const FIXTURE_TEMPLATE = join(import.meta.dir, "..", "templates", "fixture.txt")
const PROJECT = "acme"

async function spawn(cmd: string[], cwd: string) {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" })
  await proc.exited
}

export async function createTestRepo(): Promise<{
  root: string
  pm: PackageManager
  cleanup: () => Promise<void>
}> {
  const root = await mkdtemp(join(tmpdir(), "paladin-test-"))

  await hydrate(root, FIXTURE_TEMPLATE, PROJECT)

  await spawn(["git", "init"], root)
  await spawn(["git", "add", "-A"], root)
  await spawn(["git", "commit", "-m", "initial"], root)

  const pm = new PackageManager({
    root,
    projectName: PROJECT,
  })

  const cleanup = () => rm(root, { recursive: true, force: true })

  return { root, pm, cleanup }
}

export { PROJECT }
