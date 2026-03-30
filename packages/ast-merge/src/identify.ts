// @paladin/ast-merge/src/identify.ts

import type { namedTypes as n } from 'ast-types'
import type { NodeIdentity, TopLevelNode } from './types'

export function identify(node: TopLevelNode): NodeIdentity {
  switch (node.type) {
    case 'ImportDeclaration':
      return {
        kind: 'import',
        name: String((node as n.ImportDeclaration).source.value),
      }

    case 'ExportDefaultDeclaration':
      return { kind: 'export-default', name: 'default' }

    case 'ExportAllDeclaration':
      return {
        kind: 'export-all',
        name: String((node as n.ExportAllDeclaration).source.value),
      }

    case 'ExportNamedDeclaration': {
      const decl = (node as n.ExportNamedDeclaration).declaration
      if (decl) return { kind: 'export-named', name: extractDeclName(decl) }
      const source = (node as n.ExportNamedDeclaration).source
      if (source) return { kind: 'export-named', name: `re:${source.value}` }
      return { kind: 'export-named', name: '__export_list__' }
    }

    case 'FunctionDeclaration':
      return { kind: 'function', name: (node as n.FunctionDeclaration).id?.name ?? '__anonymous__' }

    case 'ClassDeclaration':
      return { kind: 'class', name: (node as n.ClassDeclaration).id?.name ?? '__anonymous__' }

    case 'VariableDeclaration':
      return { kind: 'variable', name: extractVariableName(node as n.VariableDeclaration) }

    case 'TSTypeAliasDeclaration':
      return { kind: 'type-alias', name: (node as any).id.name }

    case 'TSInterfaceDeclaration':
      return { kind: 'interface', name: (node as any).id.name }

    case 'TSEnumDeclaration':
      return { kind: 'enum', name: (node as any).id.name }

    case 'ExpressionStatement':
      return { kind: 'expression', name: '__expression__' }

    default:
      return { kind: 'unknown', name: '__unknown__' }
  }
}

function extractDeclName(decl: n.Declaration): string {
  if ('id' in decl && decl.id && 'name' in decl.id) {
    return decl.id.name
  }
  return '__anonymous__'
}

function extractVariableName(node: n.VariableDeclaration): string {
  const first = node.declarations[0]
  if (first && first.type === 'VariableDeclarator' && first.id.type === 'Identifier') {
    return first.id.name
  }
  return '__anonymous__'
}

export function toKey(id: NodeIdentity): string {
  return `${id.kind}::${id.name}`
}
