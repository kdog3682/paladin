import { bash } from '../utils/bash'

export type GitFileStatus = 'modified' | 'created'

export interface GitFile {
  relpath: string
  status: GitFileStatus
  staged: boolean
}

export interface GitData {
  dir: string
  branch: string
  files: GitFile[]
}

export interface GitLogEntry {
  hash: string
  message: string
  date: string
  author: string
}

let cwd: string | null = null

export async function setRepo(rootDir: string) {
  cwd = rootDir
}

function run(cmds: string[]) {
  if (!cwd) throw new Error('git: no repo set. call setRepo() first')
  return bash(cmds, { cwd })
}

export async function getData(): Promise<GitData> {
  const [branchResult, statusResult] = await Promise.all([
    run(['git', 'branch', '--show-current']),
    run(['git', 'status', '--porcelain']),
  ])
  const branch = branchResult.stdout.trim()
  const files = await parseStatus(statusResult.stdout.trim())
  return { dir: cwd!, branch, files }
}

async function parseStatus(raw: string): Promise<GitFile[]> {
  if (!raw) return []

  const entries = raw.split('\n').map((line) => {
    const index = line[0]
    const worktree = line[1]
    const relpath = line.slice(3)
    const staged = index !== ' ' && index !== '?'
    let status: GitFileStatus = 'modified'
    if (index === '?' || index === 'A' || worktree === 'A') {
      status = 'created'
    }
    return { relpath, status, staged }
  })

  const dirs = entries.filter((e) => e.relpath.endsWith('/'))

  let expandedFiles: string[] = []
  if (dirs.length > 0) {
    const lsResult = await run([
      'git', 'ls-files', '--others', '--exclude-standard',
      ...dirs.map((e) => e.relpath),
    ])
    const raw = lsResult.stdout.trim()
    if (raw) expandedFiles = raw.split('\n')
  }

  const results: GitFile[] = []
  for (const entry of entries) {
    if (entry.relpath.endsWith('/')) {
      for (const p of expandedFiles.filter((f) => f.startsWith(entry.relpath))) {
        results.push({ relpath: p, status: entry.status, staged: entry.staged })
      }
    } else {
      results.push(entry)
    }
  }

  return results
}

export async function add(pathspec: string = '.') {
  return run(['git', 'add', pathspec])
}

export async function commit(message: string) {
  return run(['git', 'commit', '-m', message])
}

export async function push(remote = 'origin', branch?: string) {
  const cmds = ['git', 'push', remote]
  if (branch) cmds.push(branch)
  return run(cmds)
}

export async function pull(remote = 'origin', branch?: string) {
  const cmds = ['git', 'pull', remote]
  if (branch) cmds.push(branch)
  return run(cmds)
}

export async function getFileAtCommit(commitHash: string, filePath: string): Promise<string> {
  const result = await run(['git', 'show', `${commitHash}:${filePath}`])
  return result.stdout
}

export async function getFilesForCommit(commitHash: string): Promise<string[]> {
  const result = await run([
    'git', 'diff-tree', '--no-commit-id', '--name-only', '-r', commitHash,
  ])
  const raw = result.stdout.trim()
  if (!raw) return []
  return raw.split('\n')
}

export async function restoreFiles(commitHash: string, filePaths: string[]) {
  return run(['git', 'checkout', commitHash, '--', ...filePaths])
}

export async function log(opts?: { limit?: number }): Promise<GitLogEntry[]> {
  const limit = opts?.limit ?? 20
  const result = await run([
    'git', 'log',
    `--max-count=${limit}`,
    '--format=%H\t%s\t%aI\t%an',
  ])
  const raw = result.stdout.trim()
  if (!raw) return []
  return raw.split('\n').map((line) => {
    const [hash, message, date, author] = line.split('\t')
    return { hash, message, date, author }
  })
}

export async function diff(ref?: string): Promise<string> {
  const cmds = ['git', 'diff']
  if (ref) cmds.push(ref)
  const result = await run(cmds)
  return result.stdout
}

export async function diffStaged(): Promise<string> {
  const result = await run(['git', 'diff', '--cached'])
  return result.stdout
}

export async function init(): Promise<void> {
  if (await isRepo()) return
  await run(['git', 'init'])
}

export async function isRepo(): Promise<boolean> {
  const result = await run(['git', 'rev-parse', '--is-inside-work-tree'])
  return result.exitCode === 0
}

export async function hasRemote(name = 'origin'): Promise<boolean> {
  const result = await run(['git', 'remote'])
  return result.stdout.split('\n').map((s) => s.trim()).includes(name)
}

export async function initRemoteRepo(projectName: string): Promise<void> {
  if (await hasRemote()) return
  await run(['git', 'add', '.'])
  await run(['git', 'commit', '-m', 'initial'])
  await run(['gh', 'repo', 'create', projectName, '--private', '--source=.', '--push'])
}
