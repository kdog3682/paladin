// @paladin/tooling/commit-dirty.ts
// Commits all dirty files, grouped by package, with a consistent auto-commit message.

import { $ } from "bun"

async function getDirtyFiles(): Promise<string[]> {
  // -z uses NUL as separator — avoids quoting/escaping of special filenames
  const result = await $`git status -z`.text()
  return result
    .split("\0")
    .map(entry => entry.slice(3)) // strip the 2-char status + space
    .filter(Boolean)
}

function getGroup(file: string): string {
  const pkgMatch = file.match(/^packages\/([^/]+)/)
  if (pkgMatch) return `packages/${pkgMatch[1]}`

  const topMatch = file.match(/^([^/]+)\//)
  if (topMatch) return topMatch[1]

  return "root"
}

async function main() {
  const files = await getDirtyFiles()
  if (files.length === 0) {
    console.log("Nothing to commit.")
    return
  }

  const groups = new Map<string, string[]>()
  for (const f of files) {
    const group = getGroup(f)
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push(f)
  }

  for (const [group, groupFiles] of groups) {
    console.log(`\n[${group}] — ${groupFiles.length} file(s)`)
    for (const f of groupFiles) {
      console.log(`  ${f}`)
      await $`git add -- ${f}`.quiet()
    }

    const staged = await $`git diff --cached --name-only`.text()
    if (!staged.trim()) {
      console.log(`  (nothing staged, skipping commit)`)
      continue
    }

    const scope = group === "root" ? "" : `(${group.replace("packages/", "")})`
    const msg = `chore${scope}: cleanup dirty files [auto-commit]`
    await $`git commit -m ${msg}`
  }

  console.log("\nDone.")
}

main()
