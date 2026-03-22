#!/usr/bin/env bun
// @paladin/tooling/build-chrome-ext.ts

import { file } from "bun"
import { resolve, join, basename, dirname } from "path"
import { homedir } from "os"
import { mkdir, cp, rm, exists, readFile, writeFile } from "fs/promises"

const DEST_DIR = "/mnt/chromeos/MyFiles/Downloads"
const PLACEHOLDER = "PLACEHOLDER"

let step = 0
function log(msg: string) {
  step++
  console.log(`\n[${step}] ${msg}`)
}

function skip(msg: string) {
  step++
  console.log(`\n[${step}] ${msg} [skipped]`)
}

function detail(msg: string) {
  console.log(`    -> ${msg}`)
}

function extractAllPaths(obj: unknown): Set<string> {
  const paths = new Set<string>()
  const exts = [".js", ".css", ".html", ".png", ".jpg", ".svg", ".ico", ".json", ".woff", ".woff2", ".ttf"]

  function walk(v: unknown) {
    if (typeof v === "string") {
      if (v.includes("://")) return
      if ((v.includes(".") && v.includes("/")) || exts.some(ext => v.endsWith(ext))) {
        paths.add(v)
      }
    } else if (Array.isArray(v)) {
      v.forEach(walk)
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(walk)
    }
  }

  walk(obj)
  return paths
}

async function bumpPatchVersion(projectDir: string): Promise<string> {
  const packageJsonPath = join(projectDir, "package.json")
  const manifestPath = join(projectDir, "manifest.json")

  const packageJson = await file(packageJsonPath).json() as { version?: string }
  const version = packageJson.version
  if (!version) throw new Error(`package.json is missing a version field: ${packageJsonPath}`)

  const parts = version.split(".")
  parts[2] = String(Number(parts[2]) + 1)
  const next = parts.join(".")

  packageJson.version = next
  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n", "utf8")

  if (await exists(manifestPath)) {
    const manifest = await file(manifestPath).json() as Record<string, unknown>
    manifest.version = next
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8")
  }

  detail(`Bumped version ${version} -> ${next}`)
  return next
}

async function readVersion(projectDir: string): Promise<string> {
  const packageJsonPath = join(projectDir, "package.json")
  const packageJson = await file(packageJsonPath).json() as { version?: string }
  const version = packageJson.version
  if (!version) {
    throw new Error(`package.json is missing a version field: ${packageJsonPath}`)
  }
  return version
}

function humanBuildStamp(version: string): string {
  const now = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })
  return `Built ${now} (v${version})`
}

async function backupExistingDest(dest: string, backupDir: string): Promise<void> {
  if (!(await exists(dest))) {
    skip("Backup existing destination - destination does not exist")
    return
  }

  log(`Backup existing destination to ${backupDir}`)

  if (await exists(backupDir)) {
    await rm(backupDir, { recursive: true })
    detail("Removed existing backup for this version")
  }

  await mkdir(dirname(backupDir), { recursive: true })
  await cp(dest, backupDir, { recursive: true })
  detail(`Backed up ${dest} -> ${backupDir}`)
}

async function buildExtension(projectDir: string): Promise<void> {
  log("Build extension assets")

  await rm(join(projectDir, "dist"), { recursive: true, force: true })
  detail("Cleared dist/")

  const entrypoints = [
    "src/background.ts",
    "src/content.ts",
    "src/injected.ts",
  ].map(p => join(projectDir, p))

  const result = await Bun.build({
    entrypoints,
    outdir: join(projectDir, "dist"),
    target: "browser",
    format: "iife",
    minify: true,
    naming: "[name].js",
  })

  if (!result.success) {
    for (const message of result.logs) {
      console.error(message)
    }
    throw new Error("Bun build failed")
  }

  detail(`Built ${result.outputs.length} output files`)
}

async function copyChromeExtensionFiles(projectDir: string, version: string): Promise<{ copied: string[]; dest: string }> {
  const extName = basename(projectDir)
  const dest = join(DEST_DIR, extName)
  const backupDir = join(homedir(), ".cache", extName, version)

  log(`Copy extension files to ${dest}`)
  await backupExistingDest(dest, backupDir)

  await mkdir(dest, { recursive: true })
  detail("Ensured output directory exists")

  const manifestPath = join(projectDir, "manifest.json")
  const manifest = await file(manifestPath).json()
  detail("Parsed manifest.json")

  const filesToCopy = extractAllPaths(manifest)
  filesToCopy.add("manifest.json")
  detail(`Found ${filesToCopy.size} files to copy`)

  const copied: string[] = []

  for (const filePath of filesToCopy) {
    let srcFile = join(projectDir, "dist", filePath)
    let from = "dist/"

    if (!(await exists(srcFile))) {
      srcFile = join(projectDir, filePath)
      from = ""
    }

    if (await exists(srcFile)) {
      const destFile = join(dest, filePath)
      await mkdir(dirname(destFile), { recursive: true })
      await cp(srcFile, destFile)
      copied.push(filePath)
      detail(`${from}${filePath} -> ${filePath}`)
    } else {
      detail(`${filePath} - not found, skipping`)
    }
  }

  detail(`Copied ${copied.length}/${filesToCopy.size} files`)
  return { copied, dest }
}

async function stampPlaceholder(dest: string, copied: string[], version: string): Promise<void> {
  const stamp = humanBuildStamp(version)
  log(`Stamp placeholder with build metadata: ${stamp}`)

  let replacedIn = 0

  for (const relPath of copied) {
    const absPath = join(dest, relPath)
    const lower = relPath.toLowerCase()
    const isTextLike = [".js", ".css", ".html", ".json", ".txt"].some(ext => lower.endsWith(ext))
    if (!isTextLike) continue

    const raw = await readFile(absPath, "utf8")
    if (!raw.includes(PLACEHOLDER)) continue

    const updated = raw.replaceAll(PLACEHOLDER, stamp)
    await writeFile(absPath, updated, "utf8")
    replacedIn++
    detail(`Stamped ${relPath}`)
  }

  if (replacedIn === 0) {
    skip("Placeholder stamp - no placeholder occurrences found in copied files")
  } else {
    detail(`Stamped placeholder in ${replacedIn} file(s)`)
  }
}

async function buildChromeExtension(projectDir: string): Promise<void> {
  console.log("\n========================================")
  console.log("  Build chrome extension")
  console.log(`  Project: ${basename(projectDir)}`)
  console.log(`  Path:    ${projectDir}`)
  console.log("========================================")

  if (!(await exists(projectDir))) {
    console.error(`\nProject directory does not exist: ${projectDir}`)
    process.exit(1)
  }

  log("Bump patch version")
  const version = await bumpPatchVersion(projectDir)

  await buildExtension(projectDir)
  const { copied, dest } = await copyChromeExtensionFiles(projectDir, version)
  await stampPlaceholder(dest, copied, version)

  console.log("\n========================================")
  console.log("  Done")
  console.log("========================================\n")
}

const projectDirArg = process.argv[2]
if (!projectDirArg) {
  console.error("Usage: build-chrome-ext <project-dir>")
  process.exit(1)
}

await buildChromeExtension(resolve(projectDirArg))
