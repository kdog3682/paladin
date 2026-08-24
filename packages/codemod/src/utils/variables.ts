import { Node, Statement, VariableDeclaration, VariableDeclarationKind } from "ts-morph"

/** Tells whether a declaration was declared with `const`. */
export function isConstDeclaration(declaration: VariableDeclaration): boolean {
  return declaration.getVariableStatement()?.getDeclarationKind() === VariableDeclarationKind.Const
}

function hasBlankLineBefore(node: Node): boolean {
  const before = node.getSourceFile().getFullText().slice(0, node.getStart(true))
  return /\n[ \t]*\r?\n[ \t]*$/.test(before)
}

function hasBlankLineAfter(node: Node): boolean {
  const after = node.getSourceFile().getFullText().slice(node.getEnd())
  return /^[ \t]*\r?\n[ \t]*\r?\n/.test(after)
}

/** Removes a statement, re-inserting a blank line if removal would otherwise fuse previously separated neighbors together. */
function removeStatement(statement: Statement): void {
  const preserveSpacing = hasBlankLineBefore(statement) && hasBlankLineAfter(statement)
  const container = statement.getParentOrThrow() as unknown as { getStatements(): Statement[] }
  const index = container.getStatements().indexOf(statement)

  statement.remove()

  const next = preserveSpacing ? container.getStatements()[index] : undefined
  if (next) next.getSourceFile().insertText(next.getStart(true), '\n')
}

/** Removes a declarator, or the entire statement when it was the only declarator. */
export function removeDeclaration(declaration: VariableDeclaration): void {
  const statement = declaration.getVariableStatement()
  if (statement && statement.getDeclarations().length === 1) {
    removeStatement(statement)
    return
  }
  declaration.remove()
}
