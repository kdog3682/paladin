// @paladin/tooling/package-transfer/copy.ts
import { join } from "path"
import { readFile, writeFile, cp, rm } from "fs/promises"
import { walkFiles, isRewritableFile, dirExists, scopedNameToDir, log } from "./utils"
import { determineEntryPoint, entryToOutputPath } from "./entry"

interface CopyOptions {
  sourceRoot: string
  destRoot: string
  sourceScope: string
  destScope: string
  packageName: string
  force: boolean
}

export async function copyAndRewrite(opts: CopyOptions) {
  const { sourceRoot, destRoot, sourceScope, destScope, packageName, force } = opts
  const dirName = scopedNameToDir(packageName, sourceScope)
  const srcDir = join(sourceRoot, dirName)
  const destDir = join(destRoot, dirName)

  if (await dirExists(destDir)) {
    if (!force) {
      log(`Skipping ${packageName} — already exists at ${destDir}. Use --force to overwrite.`)
      return
    }
    log(`Removing existing ${destDir}`)
    await rm(destDir, { recursive: true, force: true })
  }

  log(`Copying ${srcDir} → ${destDir}`)
  await cp(srcDir, destDir, { recursive: true })

  // remove node_modules and dist from the copy
  await rm(join(destDir, "node_modules"), { recursive: true, force: true })
  await rm(join(destDir, "dist"), { recursive: true, force: true })

  const files = await walkFiles(destDir)
  const scopePattern = new RegExp(escapeRegex(sourceScope), "g")

  for (const filePath of files) {
    if (!isRewritableFile(filePath)) continue

    const content = await readFile(filePath, "utf-8")
    const rewritten = content.replace(scopePattern, destScope)

    if (rewritten !== content) {
      await writeFile(filePath, rewritten, "utf-8")
    }
  }

  await rewritePackageJson(destDir, sourceScope, destScope)
  log(`Rewritten ${packageName} → ${destScope}/${dirName}`)
}

async function rewritePackageJson(destDir: string, sourceScope: string, destScope: string) {
  const pkgPath = join(destDir, "package.json")
  const raw = await readFile(pkgPath, "utf-8")
  const pkgJson = JSON.parse(raw)

  // rewrite name
  pkgJson.name = pkgJson.name?.replace(sourceScope, destScope)

  // rewrite dependency references
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    if (!pkgJson[field]) continue
    const updated: Record<string, string> = {}
    for (const [dep, version] of Object.entries(pkgJson[field])) {
      const newDep = dep.startsWith(`${sourceScope}/`)
        ? dep.replace(sourceScope, destScope)
        : dep
      updated[newDep] = version as string
    }
    pkgJson[field] = updated
  }

  // determine entry point and set main/exports/types
  const entryPoint = await determineEntryPoint(destDir)
  const outputFile = entryToOutputPath(entryPoint)
  const typesFile = outputFile.replace(/\.js$/, ".d.ts")

  pkgJson.main = `./dist/${outputFile}`
  pkgJson.module = `./dist/${outputFile}`
  pkgJson.types = `./dist/${typesFile}`
  pkgJson.exports = {
    ".": {
      import: `./dist/${outputFile}`,
      types: `./dist/${typesFile}`,
    },
  }

  // ensure files field includes dist
  pkgJson.files = ["dist"]

  await writeFile(pkgPath, JSON.stringify(pkgJson, null, 2) + "\n", "utf-8")
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
