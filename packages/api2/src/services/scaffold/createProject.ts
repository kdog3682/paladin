import { readSources } from './utils/readSources'
import { parseFileContent } from './utils/parseFileContent'
import { groupFiles } from './utils/groupFiles'
import type { File, Project, ScaffoldOptions } from './types'

/**
 * Reads a scaffold input — a file, a zip, or a blob of path-commented sources (// src/foobar.ts \n <code> \n ...) — and describes it as a project of grouped units.
 */
export async function createProject(
  input: string,
  opts: ScaffoldOptions,
): Promise<Project | null> {
  const contents = await readSources(input)

  const files = contents
    .map((content) => parseFileContent(content, opts))
    .filter((file): file is File => Boolean(file))

  return groupFiles(files, opts)
}
