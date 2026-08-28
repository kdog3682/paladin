import { unlink } from 'fs/promises'
import { readSources } from './utils/readSources'
import { parseFileContent } from './utils/parseFileContent'
import { groupFiles } from './utils/groupFiles'
import { hydrateBoilerplate } from './utils/hydrateBoilerplate'
import { resolveDependencies } from './utils/resolveDependencies'
import { mergeFile } from './utils/mergeFile'
import { postProcessPackageFiles } from './postProcessPackageFiles'
import type { File, Project, ScaffoldOptions, Unit } from './types'

async function persist(unit: Unit): Promise<void> {
  for (const file of unit.files) {
    if (file.action === 'skip') continue

    if (file.action === 'delete') {
      await unlink(file.path).catch(() => {})
      continue
    }

    if (file.action === 'append') {
      const current = await Bun.file(file.path).text()
      await Bun.write(file.path, mergeFile(current, file.content))
      continue
    }

    await Bun.write(file.path, file.content)
  }
}

/**
 * Reads a scaffold input (file or zip), writes the files it describes, hydrates
 * boilerplate for anything new, and installs whatever dependencies that implies.
 */
export async function scaffold(input: string, opts: ScaffoldOptions): Promise<Project | null> {
  const contents = await readSources(input)

  const files = contents
    .map((content) => parseFileContent(content, opts))
    .filter((f): f is File => f !== null)

  const project = groupFiles(files, opts)
  if (!project) return null

  for (const unit of project.units) {
    await persist(unit)
    await postProcessPackageFiles(unit)
  }

  await hydrateBoilerplate(project)
  await resolveDependencies(project)

  return project
}
