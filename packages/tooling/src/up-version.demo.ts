// @paladin/tooling/up-version.demo.ts

import { $ } from "bun"
import { basename, dirname, join } from "path"
import { homedir } from "os"

const TARGET = "~/projects/paladin/packages/scaffold-v2"

const SKIP_DIRS = [".git", "node_modules", ".next", "dist", ".turbo"]

function resolveHome(p: string) {
  return p.replace(/^~/, homedir())
}

function nextVersion(name: string): string {
  const match = name.match(/^(.+)-v(\d+)$/)
  if (match) {
    const base = match[1]
    const ver = parseInt(match[2]) + 1
    return `${base}-v${ver}`
  }
  return `${name}-v2`
}

async function isBinary(path: string): Promise<boolean> {
  const buf = await Bun.file(path).slice(0, 512).arrayBuffer()
  const bytes = new Uint8Array(buf)
  return bytes.some(b => b === 0)
}

async function replaceInFile(path: string, oldName: string, newName: string) {
  if (await isBinary(path)) return false
  const content = await Bun.file(path).text()
  if (!content.includes(oldName)) return false
  await Bun.write(path, content.replaceAll(oldName, newName))
  return true
}

async function walkFiles(dir: string): Promise<string[]> {
  const entries = []
  for await (const entry of new Bun.Glob("**/*").scan({ cwd: dir, dot: true })) {
    const skip = SKIP_DIRS.some(d => entry.startsWith(d + "/") || entry === d)
    if (!skip) entries.push(join(dir, entry))
  }
  return entries
}

async function upVersion(target: string) {
  const resolved = resolveHome(target)
  const dir = dirname(resolved)
  const currentName = basename(resolved)
  const newName = nextVersion(currentName)
  const newPath = join(dir, newName)

  console.log(`${currentName} → ${newName}`)
  console.log(`copying to ${newPath}`)

  await $`cp -a ${resolved} ${newPath}`

  const files = await walkFiles(newPath)

  let skippedBinary = 0
  let replaced = 0
  let errors = 0
  for (const file of files) {
    try {
      const size = await Bun.file(file).size
      if (size > 5_000_000) console.log(`  note: large file ${basename(file)} (${(size / 1_000_000).toFixed(1)}MB)`)
      const didReplace = await replaceInFile(file, currentName, newName)
      if (didReplace) replaced++
      else if (await isBinary(file)) skippedBinary++
    } catch (e) {
      console.warn(`  skipped (unreadable): ${file}`)
      errors++
    }
  }

  console.log(`scanned ${files.length} files, replaced in ${replaced}, skipped ${skippedBinary} binary, ${errors} errors`)
  console.log(`done: ${newPath}`)
}

upVersion(TARGET)
