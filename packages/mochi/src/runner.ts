import { readFileSync, writeFileSync, unlinkSync } from "fs"
import { parseMochiFile, extractImports } from "./parser"
import { transform } from "./transform"
import type { MochiResult, MochiSuiteResult } from "./types"

export async function mochi(files: string[]): Promise<MochiSuiteResult[]> {
  return Promise.all(files.map(runFile))
}

async function runFile(filePath: string): Promise<MochiSuiteResult> {
  const source = readFileSync(filePath, "utf-8")
  const file = parseMochiFile(source, filePath)
  const imports = extractImports(source)
  const code = transform(file, imports)

  const tmpPath = filePath.replace(/\.ts$/, ".mochi.tmp.ts")
  writeFileSync(tmpPath, code)

  let mod: Record<string, () => Promise<unknown>>
  try {
    mod = await import(tmpPath)
  } finally {
    unlinkSync(tmpPath)
  }

  const sections = await Promise.all(
    file.sections.map(async (section, si) => {
      const results: MochiResult[] = await Promise.all(
        section.stories.map(async (story, sti) => {
          const fn = mod[`_s${si}_${sti}`]
          const start = performance.now()
          try {
            const value = await fn()
            return { story, value, duration: performance.now() - start, error: null }
          } catch (e) {
            return {
              story,
              value: undefined,
              duration: performance.now() - start,
              error: e instanceof Error ? e : new Error(String(e)),
            }
          }
        })
      )
      return { title: section.title, results }
    })
  )

  return { path: filePath, sections }
}
