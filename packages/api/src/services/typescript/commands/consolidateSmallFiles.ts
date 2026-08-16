import type { TypescriptService } from '../index'
import {
  addUnique,
  countFunctions,
  declarationName,
  exportedDeclarationNames,
  lineCount,
  matchesAnyGlob,
  posix,
  removeUnusedImports,
  setExported,
  topLevelDeclarations,
} from '../utils'
import { defaultEntryPatterns } from './knip'

export type ConsolidationSummary = {
  kind: 'consolidateSmallFiles'
  merged: { from: string; into: string; symbols: string[] }[]
  deletedFiles: string[]
  changedFiles: string[]
  skipped: { file: string; reason: string }[]
  warnings: string[]
  errors: string[]
}

export type ConsolidateOptions = {
  maxFunctions?: number
  maxLines?: number
  entry?: string[]
  unexport?: boolean
}

export const consolidateSmallFiles = (
  service: TypescriptService,
  options: ConsolidateOptions = {},
): ConsolidationSummary => {
  const maxFunctions = options.maxFunctions ?? 3
  const maxLines = options.maxLines ?? 60
  const entryPatterns = options.entry ?? defaultEntryPatterns
  const unexport = options.unexport ?? true
  const summary: ConsolidationSummary = {
    kind: 'consolidateSmallFiles',
    merged: [],
    deletedFiles: [],
    changedFiles: [],
    skipped: [],
    warnings: [],
    errors: [],
  }

  for (const file of service.files()) {
    if (file.wasForgotten()) continue
    const path = posix(file.getFilePath())
    const skip = (reason: string) => summary.skipped.push({ file: path, reason })

    if (matchesAnyGlob(path, entryPatterns)) {
      skip('entry point')
      continue
    }
    const functions = countFunctions(file)
    if (functions >= maxFunctions) {
      skip(`${functions} functions`)
      continue
    }
    const lines = lineCount(file)
    if (lines >= maxLines) {
      skip(`${lines} lines`)
      continue
    }
    const importers = service.importersOf(file)
    if (importers.length !== 1) {
      skip(`${importers.length} importers`)
      continue
    }
    const names = exportedDeclarationNames(file)
    if (!names.length) {
      skip('no exports')
      continue
    }

    const targetPath = posix(importers[0].getFilePath())
    const moved: string[] = []
    for (const name of names) {
      const result = service.moveSymbol(`${path}#${name}`, targetPath)
      if (!result.ok) {
        summary.errors.push(...result.errors)
        continue
      }
      moved.push(name)
      summary.warnings.push(...result.warnings)
      for (const changed of result.changedFiles) addUnique(summary.changedFiles, changed)
      for (const created of result.createdFiles) addUnique(summary.changedFiles, created)
    }
    if (!moved.length) {
      skip('nothing moved')
      continue
    }

    const target = service.project.getSourceFile(targetPath)
    if (target && unexport) {
      for (const name of moved) {
        const declaration = topLevelDeclarations(target).find(node => declarationName(node) === name)
        if (!declaration) continue
        if (service.importersOfSymbol(target, name).length) continue
        setExported(declaration, false)
      }
    }

    summary.merged.push({ from: path, into: targetPath, symbols: moved })

    if (!file.wasForgotten()) {
      removeUnusedImports(file)
      if (file.getStatements().length === 0) {
        summary.deletedFiles.push(service.deleteFile(file))
      } else {
        summary.warnings.push(`${path} still has statements, left in place`)
      }
    }
  }

  summary.changedFiles = summary.changedFiles.filter(path => !summary.deletedFiles.includes(path))
  return summary
}
