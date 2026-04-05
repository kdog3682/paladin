// @paladin/tooling/package-transfer/build.ts
import { join } from "path"
import { readFile, writeFile } from "fs/promises"
import { fileExists, log, logError } from "./utils"
import { determineEntryPoint } from "./entry"

const MINIMAL_TSCONFIG = {
  compilerOptions: {
    target: "ESNext",
    module: "ESNext",
    moduleResolution: "bundler",
    declaration: true,
    declarationMap: true,
    sourceMap: true,
    outDir: "./dist",
    rootDir: "./src",
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    jsx: "react-jsx",
    types: ["bun-types"],
  },
  include: ["src"],
  exclude: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
}

export async function buildPackage(pkgDir: string) {
  const pkgJsonPath = join(pkgDir, "package.json")
  const raw = await readFile(pkgJsonPath, "utf-8")
  const pkgJson = JSON.parse(raw)

  const entryPoint = await determineEntryPoint(pkgDir)
  const entryIsInSrc = entryPoint.startsWith("src/")

  // ensure tsconfig exists
  const tsconfigPath = join(pkgDir, "tsconfig.json")
  if (!(await fileExists(tsconfigPath))) {
    const tsconfig = { ...MINIMAL_TSCONFIG }
    if (!entryIsInSrc) {
      tsconfig.compilerOptions = {
        ...tsconfig.compilerOptions,
        rootDir: ".",
      }
      tsconfig.include = ["."]
    }
    log(`Creating tsconfig.json for ${pkgJson.name}`)
    await writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2) + "\n", "utf-8")
  }

  // add build script if missing
  if (!pkgJson.scripts?.build) {
    pkgJson.scripts = pkgJson.scripts || {}
    pkgJson.scripts.build = "tsc"
    await writeFile(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + "\n", "utf-8")
    log(`Injected build script for ${pkgJson.name}`)
  }

  // ensure bun-types is available for tsc
  const addTypes = Bun.spawn(["bun", "add", "-d", "bun-types"], {
    cwd: pkgDir,
    stdout: "inherit",
    stderr: "inherit",
  })
  await addTypes.exited

  log(`Building ${pkgJson.name}...`)
  const proc = Bun.spawn(["bun", "run", "build"], {
    cwd: pkgDir,
    stdout: "inherit",
    stderr: "inherit",
  })

  const exitCode = await proc.exited
  if (exitCode !== 0) {
    logError(`Build failed for ${pkgJson.name} (exit code ${exitCode})`)
    process.exit(1)
  }

  log(`Built ${pkgJson.name} successfully`)
}
