// @paladin/ast-merge/src/merge.ts

import { parse, print } from 'recast'
import * as tsParser from 'recast/parsers/typescript'
import type { namedTypes as n } from 'ast-types'
import type { MergeOptions, TopLevelNode } from './types'
import { DEFAULT_OPTIONS } from './types'
import { identify, toKey } from './identify'
import { reconcileImports } from './reconcile-imports'
import { reconcileExports } from './reconcile-exports'
import { reconcileInterfaces } from './reconcile-interfaces'
import { reconcileDeclaration } from './reconcile-declarations'

const PARSER_OPTIONS = { parser: tsParser }

export function mergeContent(
  existing: string,
  incoming: string,
  options?: MergeOptions,
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const existingAst = parse(existing, PARSER_OPTIONS)
  const incomingAst = parse(incoming, PARSER_OPTIONS)

  const existingBody: TopLevelNode[] = existingAst.program.body
  const incomingBody: TopLevelNode[] = incomingAst.program.body

  // index existing nodes by key
  const existingMap = new Map<string, { node: TopLevelNode, index: number }>()
  for (let i = 0; i < existingBody.length; i++) {
    const id = identify(existingBody[i])
    const key = toKey(id)
    existingMap.set(key, { node: existingBody[i], index: i })
  }

  const consumed = new Set<string>()
  const result: TopLevelNode[] = opts.preserveOrder ? [...existingBody] : []
  const replacements = new Map<number, TopLevelNode[]>()

  for (const incomingNode of incomingBody) {
    const id = identify(incomingNode)
    const key = toKey(id)
    const match = existingMap.get(key)

    if (!match) {
      result.push(incomingNode)
      continue
    }

    consumed.add(key)
    const merged = reconcileNode(match.node, incomingNode, id, opts)

    if (opts.preserveOrder) {
      replacements.set(match.index, merged)
    } else {
      result.push(...merged)
    }
  }

  if (opts.preserveOrder) {
    for (const [index, nodes] of replacements) {
      result.splice(result.indexOf(existingBody[index]), 1, ...nodes)
    }
  }

  existingAst.program.body = result
  return print(existingAst).code
}

function reconcileNode(
  existing: TopLevelNode,
  incoming: TopLevelNode,
  id: ReturnType<typeof identify>,
  opts: Required<MergeOptions>,
): TopLevelNode[] {
  switch (id.kind) {
    case 'import':
      if (!opts.mergeImports) return [incoming]
      return [reconcileImports(existing as n.ImportDeclaration, incoming as n.ImportDeclaration)]

    case 'export-named':
      return [reconcileExports(existing as n.ExportNamedDeclaration, incoming as n.ExportNamedDeclaration)]

    case 'export-default':
    case 'export-all':
      return [incoming]

    case 'interface':
      return [reconcileInterfaces(existing as n.TSInterfaceDeclaration, incoming as n.TSInterfaceDeclaration, opts.mergeInterfaces)]

    case 'function':
    case 'class':
    case 'variable':
    case 'type-alias':
    case 'enum':
      return reconcileDeclaration(existing, incoming, opts.onConflict)

    case 'expression':
    case 'unknown':
      return [incoming]
  }
}
