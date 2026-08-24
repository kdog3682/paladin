import { Node } from "ts-morph"

/** Resolves a node to the one that actually carries the `export` modifier (the variable statement for a variable declaration, itself otherwise), or undefined if it can't carry one. */
export function getExportableNode(node: Node) {
  const target = Node.isVariableDeclaration(node)
    ? node.getVariableStatement()
    : node

  if (!target) return undefined
  if (!Node.isExportable(target)) return undefined

  return target
}
