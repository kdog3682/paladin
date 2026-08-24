// @paladin/codemod/src/utils/nodes.ts

import { Node, SourceFile, SyntaxKind } from "ts-morph"

/** Tells whether a node is a string, number, signed number, or untagged template literal. */
export function isSimpleLiteral(node: Node | undefined): boolean {
  if (!node) return false
  if (Node.isStringLiteral(node)) return true
  if (Node.isNumericLiteral(node)) return true
  if (Node.isNoSubstitutionTemplateLiteral(node)) return true
  if (Node.isPrefixUnaryExpression(node)) {
    const operator = node.getOperatorToken()
    const signed = operator === SyntaxKind.MinusToken || operator === SyntaxKind.PlusToken
    return signed && Node.isNumericLiteral(node.getOperand())
  }
  return false
}

/** Tells whether an identifier is the member half of `a.b` or `A.B` rather than a standalone reference. */
export function isMemberName(node: Node): boolean {
  const parent = node.getParent()
  if (!parent) return false
  if (Node.isPropertyAccessExpression(parent)) return parent.getNameNode() === node
  if (Node.isQualifiedName(parent)) return parent.getRight() === node
  return false
}

/** Buckets nodes by the source file they live in. */
export function groupByFile<T extends Node>(nodes: T[]): Map<SourceFile, T[]> {
  const grouped = new Map<SourceFile, T[]>()
  for (const node of nodes) {
    const file = node.getSourceFile()
    const bucket = grouped.get(file)
    if (bucket) bucket.push(node)
    else grouped.set(file, [node])
  }
  return grouped
}
