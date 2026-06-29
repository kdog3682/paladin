#!/usr/bin/env bun
import { readdirSync, readFileSync, writeFileSync, statSync } from "fs"
import { join, relative, extname, resolve, dirname } from "path"
import { execSync } from "child_process"

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".vue", ".svelte", ".css", ".html"])
const EXCLUDED_PATTERNS = [
  /^vite\.config\./,
  /^vitest\.config\./,
  /^jest\.config\./,
  /^tailwind\.config\./,
  /^postcss\.config\./,
  /^scripts\//,
]

function isSourceFile(relPath: string): boolean {
  const ext = extname(relPath)
  if (!SOURCE_EXTENSIONS.has(ext)) return false
  return !EXCLUDED_PATTERNS.some(p => p.test(relPath))
}

function findSrcRoot(dir: string): string | null {
  const srcPath = join(dir, "src")
  try {
    const stat = statSync(srcPath)
    if (stat.isDirectory()) return srcPath
  } catch {}
  return null
}

function collectFiles(inputPath: string): string[] {
  const stat = statSync(inputPath)
  if (!stat.isDirectory()) return [inputPath]

  const srcRoot = findSrcRoot(inputPath) ?? inputPath
  const files: string[] = []

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else {
        const rel = relative(srcRoot, full)
        if (isSourceFile(rel)) files.push(full)
      }
    }
  }

  walk(srcRoot)
  return files.sort()
}

function getRelativePath(filePath: string): string {
  // Find the src/ anchor in the path
  const srcIdx = filePath.lastIndexOf("/src/")
  if (srcIdx !== -1) return "src" + filePath.slice(srcIdx + 4)
  return filePath
}

const PATH_COMMENT_RE = /^(\/\/|#)\s*\S+\.\w+\s*$/

function processFile(filePath: string): string {
  const relPath = getRelativePath(filePath)
  const content = readFileSync(filePath, "utf-8")
  const lines = content.split("\n")

  let body: string
  if (lines.length > 0 && PATH_COMMENT_RE.test(lines[0].trim())) {
    body = ["// " + relPath, ...lines.slice(1)].join("\n")
  } else {
    body = ["// " + relPath, ...lines].join("\n")
  }

  return body
}

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error("Usage: open-source <path> [path...]")
  process.exit(1)
}

const allFiles: string[] = []
for (const arg of args) {
  allFiles.push(...collectFiles(arg))
}

if (allFiles.length === 0) {
  console.error("No source files found.")
  process.exit(1)
}

const sections = allFiles.map(processFile)
const document = sections.join("\n\n")

const outPath = `${process.env.HOME}/trash/temp.txt`
writeFileSync(outPath, document, "utf-8")
console.log(`Wrote ${allFiles.length} files to ${outPath}`)

function findPackageRoot(inputPath: string): string {
  let dir = statSync(inputPath).isDirectory() ? inputPath : dirname(inputPath)
  while (true) {
    try {
      const s = statSync(join(dir, "src"))
      if (s.isDirectory()) return dir
    } catch {}
    const parent = dirname(dir)
    if (parent === dir) return dir
    dir = parent
  }
}

const rootDir = findPackageRoot(resolve(args[0]))
writeFileSync(`${process.env.HOME}/activeDir.txt`, rootDir, "utf-8")
console.log(`Active dir: ${rootDir}`)

execSync(`python3 -c "import webbrowser; webbrowser.open('file://${outPath}')"`)
