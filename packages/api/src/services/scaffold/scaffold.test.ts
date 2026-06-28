import { rmSync, existsSync } from 'fs'
import { join } from 'path'
import { expandHome } from '../../utils/path'
import { setOptions, processFile } from '../fileProcessor'

const ZIP = join(import.meta.dir, 'fixtures/foobar.zip')
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

  const { gitData, codeExecutionResults } = result!.data

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
  expect(gitData).not.toBeNull()
  expect(gitData!.branch).toBeTruthy()
  expect(Array.isArray(gitData!.files)).toBe(true)

  expect(existsSync(FOOBAR_DIR)).toBe(true)
}, 60_000)
