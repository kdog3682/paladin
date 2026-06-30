import { existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { expandHome } from '../../utils/path'
import * as git from '../git'
import type { GitData } from '../git'
import type { FileEntry } from './types'

const PROJECTS_LOG = expandHome('~/.paladin/system/logs/projects.jsonl')

export async function syncFiles(files: FileEntry[]): Promise<FileEntry[]> {
  const changed: FileEntry[] = []
  for (const f of files) {
    if (existsSync(f.path) && (await Bun.file(f.path).text()) === f.content) continue
    mkdirSync(dirname(f.path), { recursive: true })
    await Bun.write(f.path, f.content)
    changed.push(f)
  }
  return changed
}

export async function logProject(name: string, language: string): Promise<void> {
  const logDir = dirname(PROJECTS_LOG)
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
  const entry = JSON.stringify({ name, language, timestamp: new Date().toISOString() }) + '\n'
  const existing = existsSync(PROJECTS_LOG) ? await Bun.file(PROJECTS_LOG).text() : ''
  await Bun.write(PROJECTS_LOG, existing + entry)
}

export async function handleGit(
  dir: string,
  projectName: string,
  isNew: boolean,
  opts: { initLocal: boolean; initRemote: boolean },
): Promise<GitData | null> {
  await git.setRepo(dir)
  if (opts.initLocal && isNew) await git.init()
  if (opts.initLocal && opts.initRemote && isNew) await git.initRemoteRepo(projectName)
  try {
    return await git.getData()
  } catch {
    return null
  }
}
