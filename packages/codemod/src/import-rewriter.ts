// @paladin/codemod/src/import-rewriter.ts

import { readdir, readFile, writeFile } from "fs/promises"
import { join, relative, dirname, extname } from "path"
import jscodeshift from "jscodeshift"

const JS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"])

async function collectFiles(dir: string): Promise<string[]> {
  const results: string[] = []

  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue
        await walk(full)
      } else if (JS_EXTENSIONS.has(extname(entry.name))) {
        results.push(full)
      }
    }
  }

  await walk(dir)
  return results
}

function computeNewImport(
  importingFile: string,
  oldTarget: string,
  newTarget: string,
  currentImportPath: string
): string | null {
  const importingDir = dirname(importingFile)

  // Check if the current import resolves to the old target
  const resolvedOld = join(importingDir, currentImportPath)
  const oldNoExt = oldTarget.replace(/\.[^.]+$/, "")
  const resolvedNoExt = resolvedOld.replace(/\.[^.]+$/, "")

  // Also handle index imports
  const isMatch =
    resolvedNoExt === oldNoExt ||
    resolvedOld === oldTarget ||
    resolvedNoExt === join(oldNoExt, "index")

  if (!isMatch) return null

  let newRel = relative(importingDir, newTarget.replace(/\.[^.]+$/, ""))
  if (!newRel.startsWith(".")) newRel = `./${newRel}`

  return newRel
}

/**
 * Rewrites import statements across a directory when a file is moved.
 * Updates all files that import from the old path to point to the new path.
 */
export async function importRewriter(
  oldPath: string,
  newPath: string,
  rootDir: string
): Promise<string[]> {
  const files = await collectFiles(rootDir)
  const updated: string[] = []
  const j = jscodeshift.withParser("tsx")

  for (const file of files) {
    if (file === oldPath || file === newPath) continue

    const source = await readFile(file, "utf-8")
    const root = j(source)
    let changed = false

    root
      .find(j.ImportDeclaration)
      .filter((path) => {
        const value = path.node.source.value as string
        return value.startsWith(".")
      })
      .forEach((path) => {
        const currentImport = path.node.source.value as string
        const newImport = computeNewImport(file, oldPath, newPath, currentImport)
        if (newImport) {
          path.node.source.value = newImport
          changed = true
        }
      })

    if (changed) {
      await writeFile(file, root.toSource())
      updated.push(file)
    }
  }

  // Also update imports inside the moved file itself
  const movedSource = await readFile(newPath, "utf-8")
  const movedRoot = j(movedSource)
  let movedChanged = false
  const oldDir = dirname(oldPath)
  const newDir = dirname(newPath)

  movedRoot
    .find(j.ImportDeclaration)
    .filter((path) => {
      const value = path.node.source.value as string
      return value.startsWith(".")
    })
    .forEach((path) => {
      const currentImport = path.node.source.value as string
      const resolvedTarget = join(oldDir, currentImport)
      let newRel = relative(newDir, resolvedTarget)
      if (!newRel.startsWith(".")) newRel = `./${newRel}`

      if (newRel !== currentImport) {
        path.node.source.value = newRel
        movedChanged = true
      }
    })

  if (movedChanged) {
    await writeFile(newPath, movedRoot.toSource())
    updated.push(newPath)
  }

  return updated
}
