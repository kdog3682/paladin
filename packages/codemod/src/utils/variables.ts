import { Node, Statement, VariableDeclaration, VariableDeclarationKind } from "ts-morph"

/**
 * Tells whether a declaration was declared with `const`.
 * The kind lives on the parent statement, so codemods that must not touch rebindable values keep re-deriving this.
 */
export function isConstDeclaration(declaration: VariableDeclaration): boolean {
  return declaration.getVariableStatement()?.getDeclarationKind() === VariableDeclarationKind.Const
}

/**
 * Tells whether a declaration is exported from its module.
 * The `export` modifier also lives on the parent statement, which makes the check easy to get wrong inline.
 */
export function isExportedDeclaration(declaration: VariableDeclaration): boolean {
  return declaration.getVariableStatement()?.isExported() ?? false
}

function hasBlankLineBefore(node: Node): boolean {
  const before = node.getSourceFile().getFullText().slice(0, node.getStart(true))
  return /\n[ \t]*\r?\n[ \t]*$/.test(before)
}

function hasBlankLineAfter(node: Node): boolean {
  const after = node.getSourceFile().getFullText().slice(node.getEnd())
  return /^[ \t]*\r?\n[ \t]*\r?\n/.test(after)
}

/**
 * Removes a statement, re-inserting a single blank line if removal would otherwise fuse two
 * previously blank-line-separated neighbors together. `Node.remove()` eats blank-line trivia on
 * both sides of the removed statement, which is only right when the statement wasn't spaced from
 * both neighbors to begin with.
 */
function removeStatement(statement: Statement): void {
  const preserveSpacing = hasBlankLineBefore(statement) && hasBlankLineAfter(statement)
  const container = statement.getParentOrThrow() as unknown as { getStatements(): Statement[] }
  const index = container.getStatements().indexOf(statement)

  statement.remove()

  const next = preserveSpacing ? container.getStatements()[index] : undefined
  if (next) next.getSourceFile().insertText(next.getStart(true), '\n')
}

/**
 * Removes a declarator, or the entire statement when it was the only declarator.
 * Removing a declarator on its own can leave a dangling `const` behind, which every removal codemod must handle.
 */
export function removeDeclaration(declaration: VariableDeclaration): void {
  const statement = declaration.getVariableStatement()
  if (statement && statement.getDeclarations().length === 1) {
    removeStatement(statement)
    return
  }
  declaration.remove()
}
