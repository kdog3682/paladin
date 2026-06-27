import { rmSync, existsSync } from 'fs'
import { expandHome } from '../../utils/path'
import { setOptions, processFile } from '../fileProcessor'

const ZIP = expandHome('~/scratch/files (4).zip')
const FOOBAR_DIR = expandHome('~/projects/foobar')

beforeAll(() => {
  if (existsSync(FOOBAR_DIR)) {
    rmSync(FOOBAR_DIR, { recursive: true, force: true })
  }
  setOptions({ git: { initLocalRepo: true, initRemoteRepository: false } })
})

test('scaffolds foobar project from zip', async () => {
  const result = await processFile(ZIP)

  expect(result).not.toBeNull()
  expect(result!.event).toBe('fileProcessor:scaffold')

  const { projectData, gitData, codeExecutionResults } = result!.data

  // project shape
  expect(projectData.name).toBe('foobar')
  expect(projectData.isNew).toBe(true)
  expect(existsSync(FOOBAR_DIR)).toBe(true)

  // goodbye files land at project root (not in a package)
  expect(projectData.files.some((f) => f.relpath.includes('goodbye'))).toBe(true)

  // hello package
  expect(projectData.packages).toHaveLength(1)
  const hello = projectData.packages[0]
  expect(hello.name).toBe('hello')
  expect(hello.deps).toHaveProperty('tree-sitter')
  expect(hello.deps).toHaveProperty('tree-sitter-typescript')

  // code execution ran demo/test files
  expect(codeExecutionResults.length).toBeGreaterThanOrEqual(1)
  for (const r of codeExecutionResults) {
    expect(r.stderr).toBe('')
    expect(r.exitCode).toBe(0)
  }

  // cookie.demo.ts output
  const demo = codeExecutionResults.find((r) => r.args.join(' ').includes('cookie.demo'))
  expect(demo).toBeDefined()
  expect(demo!.stdout).toContain('chocolate chip cookie')

  // git data
  expect(gitData.branch).toBeTruthy()
  expect(Array.isArray(gitData.files)).toBe(true)
}, 60_000)
