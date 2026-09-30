import { existsSync, statSync } from "node:fs"
import { mkdir, rename, rm } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"
import type { Project } from "ts-morph"
import { renameSymbol } from "./codemods/renameSymbol"
import { createProject, packageRootOf } from "./project"
import { deleteFile } from "./utils/source-files"

const SOURCE = /\.(ts|tsx|mts|cts)$/

export type PathResult = {
  /** absolute paths of the files the change rewrote, the target included */
  touched: string[]
}

/**
 * Moves a file or directory, rewriting every import of it across the owning package. Anything
 * that isn't a source file is moved as is.
 */
export async function renamePath(from: string, to: string): Promise<PathResult & { from: string, to: string }> {
  const source = resolve(from)
  if (!existsSync(source)) throw new Error(`renamePath: no such path: ${source}`)

  const target = resolveTarget(source, to)
  if (existsSync(target)) throw new Error(`renamePath: already exists: ${target}`)
  await mkdir(dirname(target), { recursive: true })

  const isDir = statSync(source).isDirectory()
  if (!isDir && !SOURCE.test(source)) {
    await rename(source, target)
    return { from: source, to: target, touched: [target] }
  }

  const project = createProject(packageRootOf(source))
  if (isDir) {
    const dir = project.getDirectory(source)
    // a directory with no source files in it has no imports to fix
    if (!dir) {
      await rename(source, target)
      return { from: source, to: target, touched: [target] }
    }
    dir.move(target)
  } else {
    project.getSourceFileOrThrow(source).move(target)
  }

  return { from: source, to: target, ...(await save(project)) }
}

/** Deletes a file or directory, dropping every import of it across the owning package. */
export async function deletePath(path: string): Promise<PathResult & { path: string }> {
  const target = resolve(path)
  if (!existsSync(target)) throw new Error(`deletePath: no such path: ${target}`)

  const isDir = statSync(target).isDirectory()
  if (!isDir && !SOURCE.test(target)) {
    await rm(target)
    return { path: target, touched: [] }
  }

  const project = createProject(packageRootOf(target))
  const files =
    isDir ?
      project.getSourceFiles().filter(file => file.getFilePath().startsWith(`${target}/`))
    : [project.getSourceFileOrThrow(target)]

  for (const file of files) {
    if (file.wasForgotten()) continue
    deleteFile(project, file)
  }

  const result = await save(project)
  // the source files are gone; anything else under the directory goes with it
  if (isDir) await rm(target, { recursive: true, force: true })

  return { path: target, ...result }
}

/** Renames a symbol declared in a file, updating its references across the owning package. */
export async function renameSymbolAt(
  file: string,
  name: string,
  newName: string,
): Promise<PathResult & { file: string }> {
  const path = resolve(file)
  const project = createProject(packageRootOf(path))
  renameSymbol(project, name, newName, path)

  return { file: path, ...(await save(project)) }
}

async function save(project: Project): Promise<PathResult> {
  const touched = project
    .getSourceFiles()
    .filter(file => !file.isSaved())
    .map(file => file.getFilePath())

  await project.save()
  return { touched }
}

/** A target that names a directory, or ends in a slash, means "into that directory under the same name". */
function resolveTarget(source: string, to: string): string {
  const path = isAbsolute(to) ? to : resolve(dirname(source), to)
  const intoDir = to.endsWith("/") || (existsSync(path) && statSync(path).isDirectory())
  return intoDir ? join(path, basename(source)) : path
}
