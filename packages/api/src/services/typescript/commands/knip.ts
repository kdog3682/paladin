import type { SourceFile } from 'ts-morph'
import type { TypescriptService } from '../index'
import {
  addUnique,
  contains,
  declarationName,
  isExportedDeclaration,
  matchesAnyGlob,
  posix,
  referenceNodes,
  statementOf,
  topLevelDeclarations,
} from '../utils'

export type CleanupSummary = {
  kind: 'knip'
  passes: number
  deletedFiles: string[]
  deletedSymbols: string[]
  changedFiles: string[]
  warnings: string[]
  errors: string[]
}

export type KnipOptions = {
  entry?: string[]
  maxPasses?: number
}

export const defaultEntryPatterns = [
  '**/index.ts',
  '**/main.ts',
  '**/cli.ts',
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/*.d.ts',
]

const reachableFiles = (service: TypescriptService, entries: SourceFile[]) => {
  const seen = new Set<SourceFile>()
  const queue = [...entries]
  while (queue.length) {
    const file = queue.shift()
    if (!file || seen.has(file)) continue
    seen.add(file)
    for (const declaration of file.getImportDeclarations()) {
      const resolved = service.resolveImport(declaration)
      if (resolved && !seen.has(resolved)) queue.push(resolved)
    }
    for (const declaration of file.getExportDeclarations()) {
      if (!declaration.getModuleSpecifierValue()) continue
      const resolved = service.resolveImport(declaration)
      if (resolved && !seen.has(resolved)) queue.push(resolved)
    }
  }
  return seen
}

export const knip = (service: TypescriptService, options: KnipOptions = {}): CleanupSummary => {
  const entryPatterns = options.entry ?? defaultEntryPatterns
  const maxPasses = options.maxPasses ?? 8
  const summary: CleanupSummary = {
    kind: 'knip',
    passes: 0,
    deletedFiles: [],
    deletedSymbols: [],
    changedFiles: [],
    warnings: [],
    errors: [],
  }

  for (let pass = 0; pass < maxPasses; pass += 1) {
    summary.passes = pass + 1
    let touched = false

    const files = service.files()
    const entries = files.filter(file => matchesAnyGlob(file.getFilePath(), entryPatterns))
    if (!entries.length) {
      summary.warnings.push('no entry points matched, skipping file pruning')
    } else {
      const reachable = reachableFiles(service, entries)
      for (const file of files) {
        if (reachable.has(file)) continue
        summary.deletedFiles.push(service.deleteFile(file))
        touched = true
      }
    }

    for (const file of service.files()) {
      if (file.wasForgotten()) continue
      const path = posix(file.getFilePath())
      const isEntry = matchesAnyGlob(path, entryPatterns)
      const unused: string[] = []
      for (const declaration of topLevelDeclarations(file)) {
        const name = declarationName(declaration)
        if (!name) continue
        if (isEntry && isExportedDeclaration(declaration)) continue
        const own = statementOf(declaration)
        const references = referenceNodes(declaration).filter(reference => !contains(own, reference))
        if (references.length) continue
        unused.push(name)
      }
      for (const name of unused) {
        const result = service.deleteSymbol(`${path}#${name}`)
        if (!result.ok) {
          summary.errors.push(...result.errors)
          continue
        }
        summary.deletedSymbols.push(`${path}#${name}`)
        for (const changed of result.changedFiles) addUnique(summary.changedFiles, changed)
        touched = true
      }
    }

    if (!touched) break
  }

  summary.changedFiles = summary.changedFiles.filter(path => !summary.deletedFiles.includes(path))
  return summary
}
