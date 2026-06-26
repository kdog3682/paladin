import { expandHome } from '../../utils/path'
import { scaffold, scaffoldFromContents, readInputs } from './scaffold'
import { extractHeader } from './scaffold/prepare'
import { codeRunner } from './codeRunner'
import type { ProjectData, ScaffoldOptions } from './scaffold/types'

// fileProcessor is the orchestrator: every option the frontend toggles flows
// through this config and is fanned out to the scaffold / codeRunner services.
let config = {
  projectScaffold: {
    git: {
      initLocalRepo: true,
      initRemoteRepository: true,
    },
    activeDir: null as string | null,
    baseProjectsDir: '~/projects',
  },
  codeExecution: {
    autoRun: true,
  },
}

type Config = typeof config

export function setOptions(opts: {
  projectScaffold?: Partial<Omit<Config['projectScaffold'], 'git'>> & {
    git?: Partial<Config['projectScaffold']['git']>
  }
  codeExecution?: Partial<Config['codeExecution']>
}): void {
  config = {
    projectScaffold: {
      ...config.projectScaffold,
      ...opts.projectScaffold,
      git: { ...config.projectScaffold.git, ...opts.projectScaffold?.git },
    },
    codeExecution: { ...config.codeExecution, ...opts.codeExecution },
  }
}

export function getOptions(): Config {
  return config
}

// maps the partitioned frontend config onto the scaffold service options
function scaffoldOpts(): Partial<ScaffoldOptions> {
  const ps = config.projectScaffold
  return {
    baseProjectDir: ps.baseProjectsDir,
    activeDir: ps.activeDir,
    git: ps.git.initLocalRepo,
    remote: ps.git.initRemoteRepository,
  }
}

// collapses each file entry down to its relpath string for the frontend.
function toRelpaths(project: ProjectData) {
  return {
    ...project,
    files: project.files.map((f) => f.relpath),
    packages: project.packages.map((p) => ({ ...p, files: p.files.map((f) => f.relpath) })),
  }
}

// pending invalid-path state, awaiting corrections from the frontend
let pending: { file: string; opts: Partial<ScaffoldOptions> } | null = null

async function finalize(project: ProjectData | null) {
  if (!project) return
  if (project.error) {
    return { event: 'scaffold', data: { project: toRelpaths(project) } }
  }

  const files = [...project.files, ...project.packages.flatMap((p) => p.files)]

  let runResults
  if (config.codeExecution.autoRun) {
    runResults = await codeRunner(files, scaffoldOpts())
  }

  return { event: 'scaffold', data: { project: toRelpaths(project), runResults } }
}

export async function processFile(file: string) {
  // no extension gate: any file with a path comment is resolved as normal
  // (e.g. a vite.tpl that needs to land somewhere specific)

  // if (basename(file) === 'actions.json') {
  //   return { event: 'actions', data: await processActions(JSON.parse(await Bun.file(file).text())) }
  // }

  const opts = scaffoldOpts()
  const project = await scaffold(file, opts)

  pending = project?.error?.type === 'pathResolution' ? { file, opts } : null

  return finalize(project)
}

// rewrites a single file's path comment when a correction targets it.
function applyCorrection(content: string, corrections: { original: string; new: string }[]): string {
  const header = extractHeader(content)
  if (!header) return content

  const corr = corrections.find((c) => c.original === header.rawPath)
  if (!corr) return content

  const lines = content.split('\n')
  for (let i = 0; i < Math.min(lines.length, 2); i++) {
    if (lines[i].includes(header.rawPath)) {
      lines[i] = lines[i].replace(header.rawPath, corr.new)
      break
    }
  }
  return lines.join('\n')
}

// applies the user's path corrections and resumes scaffolding from where it
// left off (already-written files are skipped as unchanged).
export async function fixInvalidPaths(corrections: { original: string; new: string }[]) {
  if (!pending) return

  const contents = await readInputs(expandHome(pending.file))
  const fixed = contents.map((c) => applyCorrection(c, corrections))
  const project = await scaffoldFromContents(fixed, pending.opts)

  pending = project?.error?.type === 'pathResolution' ? pending : null

  return finalize(project)
}
