// @paladin/tooling/package-transfer/index.ts
import { parseArgs } from "util"
import { join } from "path"
import { resolveLocalDeps } from "./resolve"
import { copyAndRewrite } from "./copy"
import { buildPackage } from "./build"
import { publishPackage } from "./publish"
import { scopedNameToDir, log, logError } from "./utils"

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    package: { type: "string", short: "p" },
    "source-root": { type: "string", short: "s" },
    "dest-root": { type: "string", short: "d" },
    "source-scope": { type: "string" },
    "dest-scope": { type: "string" },
    force: { type: "boolean", short: "f", default: false },
    "dry-run": { type: "boolean", default: false },
    "skip-publish": { type: "boolean", default: false },
  },
  strict: true,
})

const packageName = values.package
const sourceRoot = values["source-root"]
const destRoot = values["dest-root"]
const sourceScope = values["source-scope"]
const destScope = values["dest-scope"]
const force = values.force ?? false
const dryRun = values["dry-run"] ?? false
const skipPublish = values["skip-publish"] ?? false

if (!packageName || !sourceRoot || !destRoot || !sourceScope || !destScope) {
  console.log(`
Usage:
  bun run index.ts \\
    --package <scoped-name> \\
    --source-root <path> \\
    --dest-root <path> \\
    --source-scope <@scope> \\
    --dest-scope <@scope> \\
    [--force] [--dry-run] [--skip-publish]

Example:
  bun run index.ts \\
    --package @paladin/mochi \\
    --source-root ~/projects/paladin \\
    --dest-root ~/projects/bklearn \\
    --source-scope @paladin \\
    --dest-scope @bklearn \\
    --force
`)
  process.exit(1)
}

async function main() {
  log(`Resolving dependency tree for ${packageName}...`)
  const sorted = await resolveLocalDeps(packageName, sourceRoot, sourceScope)

  log(`\nPackages to transfer (in order):`)
  sorted.forEach((name, i) => log(`  ${i + 1}. ${name}`))

  if (dryRun) {
    log("\n--dry-run: stopping before copy/build/publish")
    process.exit(0)
  }

  for (const pkg of sorted) {
    log(`\n${"=".repeat(50)}`)
    log(`Processing ${pkg}`)
    log("=".repeat(50))

    // copy + rewrite
    await copyAndRewrite({
      sourceRoot,
      destRoot,
      sourceScope,
      destScope,
      packageName: pkg,
      force,
    })

    // install deps
    const dirName = scopedNameToDir(pkg, sourceScope)
    const destDir = join(destRoot, dirName)

    log(`Installing dependencies for ${pkg}...`)
    const install = Bun.spawn(["bun", "install"], {
      cwd: destDir,
      stdout: "inherit",
      stderr: "inherit",
    })
    const installExit = await install.exited
    if (installExit !== 0) {
      logError(`bun install failed for ${pkg}`)
      process.exit(1)
    }

    // build
    await buildPackage(destDir)

    // publish
    if (!skipPublish) {
      await publishPackage(destDir)
    } else {
      log(`Skipping publish for ${pkg} (--skip-publish)`)
    }
  }

  log(`\nDone! Transferred ${sorted.length} package(s).`)
}

main()
