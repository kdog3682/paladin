// @paladin/tooling/package-transfer/publish.ts
import { join } from "path"
import { writeFile } from "fs/promises"
import { log, logError } from "./utils"

export async function publishPackage(pkgDir: string) {
  const npmToken = process.env.NPM_TOKEN
  if (!npmToken) {
    logError("NPM_TOKEN is not set")
    process.exit(1)
  }

  // write .npmrc in the package dir
  const npmrcPath = join(pkgDir, ".npmrc")
  await writeFile(
    npmrcPath,
    `//registry.npmjs.org/:_authToken=${npmToken}\n`,
    "utf-8",
  )

  log(`Publishing from ${pkgDir}...`)
  const proc = Bun.spawn(["bun", "publish", "--access", "public"], {
    cwd: pkgDir,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, NPM_TOKEN: npmToken },
  })

  const exitCode = await proc.exited
  if (exitCode !== 0) {
    logError(`Publish failed for ${pkgDir} (exit code ${exitCode})`)
    process.exit(1)
  }

  log(`Published successfully`)
}
