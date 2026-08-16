import { consolidateSmallFiles, knip } from './commands'
import type { CleanupSummary, ConsolidateOptions, ConsolidationSummary, KnipOptions } from './commands'
import { TypescriptService } from './index'
import type { EditResult } from './utils'
import { posix } from './utils'

export type Operation =
  | { op: 'renameFile'; file: string; to: string }
  | { op: 'renameSymbol'; symbol: string; to: string }
  | { op: 'moveSymbol'; symbol: string; to: string }
  | { op: 'deleteSymbol'; symbol: string }
  | ({ op: 'knip' } & KnipOptions)
  | ({ op: 'consolidateSmallFiles' } & ConsolidateOptions)

export type Plan = {
  dir?: string
  tsconfig?: string
  importExtension?: string
  dryRun?: boolean
  ops: Operation[]
}

export type RunOutcome =
  | { type: 'edit'; result: EditResult }
  | { type: 'knip'; result: CleanupSummary }
  | { type: 'consolidate'; result: ConsolidationSummary }
  | { type: 'error'; op: string; message: string }

export type RunReport = {
  plan: Plan
  outcomes: RunOutcome[]
  report: string
}

export const runPlan = (plan: Plan): RunReport => {
  const dir = plan.dir ?? process.cwd()
  const service = new TypescriptService(dir, {
    tsConfigFilePath: plan.tsconfig,
    importExtension: plan.importExtension,
  })
  const outcomes = runOperations(service, plan.ops ?? [])
  if (!plan.dryRun) service.save()
  return { plan, outcomes, report: formatReport(dir, plan, outcomes) }
}

export const runOperations = (service: TypescriptService, ops: Operation[]): RunOutcome[] => {
  const outcomes: RunOutcome[] = []
  for (const operation of ops) {
    try {
      outcomes.push(runOperation(service, operation))
    } catch (error) {
      outcomes.push({
        type: 'error',
        op: operation.op ?? 'unknown',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return outcomes
}

export const runOperation = (service: TypescriptService, operation: Operation): RunOutcome => {
  switch (operation.op) {
    case 'renameFile':
      return { type: 'edit', result: service.renameFile(operation.file, operation.to) }
    case 'renameSymbol':
      return { type: 'edit', result: service.renameSymbol(operation.symbol, operation.to) }
    case 'moveSymbol':
      return { type: 'edit', result: service.moveSymbol(operation.symbol, operation.to) }
    case 'deleteSymbol':
      return { type: 'edit', result: service.deleteSymbol(operation.symbol) }
    case 'knip':
      return { type: 'knip', result: knip(service, operation) }
    case 'consolidateSmallFiles':
      return { type: 'consolidate', result: consolidateSmallFiles(service, operation) }
    default:
      return {
        type: 'error',
        op: (operation as { op?: string }).op ?? 'unknown',
        message: `unknown operation: ${(operation as { op?: string }).op}`,
      }
  }
}

const relativize = (dir: string, path: string) => {
  const base = posix(dir).replace(/\/$/, '')
  const value = posix(path)
  return base && value.startsWith(`${base}/`) ? value.slice(base.length + 1) : value
}

export const formatReport = (dir: string, plan: Plan, outcomes: RunOutcome[]) => {
  const rel = (path: string) => relativize(dir, path)
  const lines: string[] = []
  const failures = outcomes.filter(outcome => outcome.type === 'error' || (outcome.type === 'edit' && !outcome.result.ok))

  lines.push(`typescript service · ${posix(dir)}${plan.dryRun ? ' · dry run' : ''}`)
  lines.push(`${outcomes.length} operation${outcomes.length === 1 ? '' : 's'} · ${failures.length} failed`)
  lines.push('')

  let changed = 0
  let created = 0
  let deleted = 0

  for (const outcome of outcomes) {
    if (outcome.type === 'error') {
      lines.push(`  ✗ ${outcome.op}`)
      lines.push(`      ${outcome.message}`)
      lines.push('')
      continue
    }

    if (outcome.type === 'edit') {
      const result = outcome.result
      lines.push(`  ${result.ok ? '✓' : '✗'} ${result.kind.padEnd(18)} ${result.target}`)
      if (result.detail) lines.push(`      ${result.detail}`)
      for (const path of result.createdFiles) lines.push(`      + ${rel(path)}`)
      for (const path of result.deletedFiles) lines.push(`      - ${rel(path)}`)
      for (const path of result.changedFiles) lines.push(`      ~ ${rel(path)}`)
      for (const warning of result.warnings) lines.push(`      ! ${warning}`)
      for (const error of result.errors) lines.push(`      ✗ ${error}`)
      changed += result.changedFiles.length
      created += result.createdFiles.length
      deleted += result.deletedFiles.length
      lines.push('')
      continue
    }

    if (outcome.type === 'knip') {
      const result = outcome.result
      lines.push(`  ✓ knip               ${result.passes} pass${result.passes === 1 ? '' : 'es'}`)
      lines.push(
        `      ${result.deletedFiles.length} file(s), ${result.deletedSymbols.length} symbol(s) removed`,
      )
      for (const path of result.deletedFiles) lines.push(`      - ${rel(path)}`)
      for (const symbol of result.deletedSymbols) lines.push(`      - ${rel(symbol)}`)
      for (const path of result.changedFiles) lines.push(`      ~ ${rel(path)}`)
      for (const warning of result.warnings) lines.push(`      ! ${warning}`)
      for (const error of result.errors) lines.push(`      ✗ ${error}`)
      changed += result.changedFiles.length
      deleted += result.deletedFiles.length
      lines.push('')
      continue
    }

    const result = outcome.result
    lines.push(`  ✓ consolidate        ${result.merged.length} file(s) merged`)
    for (const merge of result.merged) {
      lines.push(`      → ${rel(merge.from)} into ${rel(merge.into)} [${merge.symbols.join(', ')}]`)
    }
    for (const path of result.deletedFiles) lines.push(`      - ${rel(path)}`)
    for (const path of result.changedFiles) lines.push(`      ~ ${rel(path)}`)
    for (const entry of result.skipped) lines.push(`      · skipped ${rel(entry.file)} (${entry.reason})`)
    for (const warning of result.warnings) lines.push(`      ! ${warning}`)
    for (const error of result.errors) lines.push(`      ✗ ${error}`)
    changed += result.changedFiles.length
    deleted += result.deletedFiles.length
    lines.push('')
  }

  lines.push('summary')
  lines.push(`  ${created} created · ${changed} changed · ${deleted} deleted`)
  lines.push(plan.dryRun ? '  nothing written to disk' : '  changes written to disk')
  return lines.join('\n')
}

export const parsePlan = (input: string): Plan => {
  const parsed = JSON.parse(input.trim())
  return Array.isArray(parsed) ? { ops: parsed as Operation[] } : (parsed as Plan)
}

export const main = async (argv: string[]) => {
  const input = argv[2]
  if (!input) {
    console.error("usage: bun cli.ts '<json>'   |   bun cli.ts @plan.json")
    process.exit(1)
    return
  }
  const raw = input.startsWith('@') ? await Bun.file(input.slice(1)).text() : input
  const outcome = runPlan(parsePlan(raw))
  console.log(outcome.report)
  const failed = outcome.outcomes.some(
    entry => entry.type === 'error' || (entry.type === 'edit' && !entry.result.ok),
  )
  if (failed) process.exit(1)
}

if (import.meta.main) await main(process.argv)
