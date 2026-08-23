// @paladin/codemod/src/transforms/inlineInfrequentConstants.ts

import { ExportSpecifier, Identifier, ImportSpecifier, Node, Project, SyntaxKind, VariableDeclaration } from "ts-morph"
import { removeImportSpecifier } from "../utils/imports"
import { groupByFile, isMemberName, isSimpleLiteral } from "../utils/nodes"
import { deleteFile, hasExports, hasOnlyImports, insertAfterImports } from "../utils/source-files"
import { isConstDeclaration, isExportedDeclaration, removeDeclaration } from "../utils/variables"

export type InlineInfrequentConstantsOptions = {
  maxUses?: number
  deleteEmptiedFiles?: boolean
}

type DeclarationReferences = {
  uses: Identifier[]
  importSpecifiers: ImportSpecifier[]
  exportSpecifiers: ExportSpecifier[]
}

type InlineEdit = {
  node: Node
  text: string
}

export function inlineInfrequentConstants(project: Project, options: InlineInfrequentConstantsOptions = {}) {
  const maxUses = options.maxUses ?? 1
  const deleteEmptiedFiles = options.deleteEmptiedFiles ?? true
  const stripped = new Set<string>()

  let pending = true
  while (pending) {
    const inlined = inlineLocalConstants(project, maxUses)
    const relocated = relocateSingleConsumerConstants(project, stripped)
    pending = inlined || relocated
  }

  if (deleteEmptiedFiles) deleteStrippedFiles(project, stripped)
}

function inlineLocalConstants(project: Project, maxUses: number): boolean {
  let changed = false
  for (const file of project.getSourceFiles()) {
    const declarations = file.getDescendantsOfKind(SyntaxKind.VariableDeclaration).filter(isConstDeclaration)
    for (const declaration of declarations) {
      if (declaration.wasForgotten()) continue
      if (inlineConstant(declaration, maxUses)) changed = true
    }
  }
  return changed
}

function inlineConstant(declaration: VariableDeclaration, maxUses: number): boolean {
  const nameNode = declaration.getNameNode()
  if (!Node.isIdentifier(nameNode)) return false

  const initializer = declaration.getInitializer()
  if (!initializer || !isSimpleLiteral(initializer)) return false

  const references = collectReferences(declaration)
  if (references.exportSpecifiers.length > 0) return false
  if (references.importSpecifiers.length > 0) return false
  if (references.uses.length === 0) return false
  if (references.uses.length > maxUses) return false

  const path = declaration.getSourceFile().getFilePath()
  const isLocal = references.uses.every(use => use.getSourceFile().getFilePath() === path && !isMemberName(use))
  if (!isLocal) return false

  const name = nameNode.getText()
  const value = initializer.getText()

  applyInlineEdits(references.uses.map(use => getInlineEdit(use, name, value)))
  removeDeclaration(declaration)
  return true
}

function relocateSingleConsumerConstants(project: Project, stripped: Set<string>): boolean {
  let changed = false
  for (const file of project.getSourceFiles()) {
    const declarations = file.getVariableDeclarations().filter(isConstDeclaration)
    for (const declaration of declarations) {
      if (declaration.wasForgotten()) continue
      if (!isExportedDeclaration(declaration)) continue
      if (!relocateConstant(declaration)) continue

      stripped.add(file.getFilePath())
      changed = true
    }
  }
  return changed
}

function relocateConstant(declaration: VariableDeclaration): boolean {
  const nameNode = declaration.getNameNode()
  if (!Node.isIdentifier(nameNode)) return false
  if (!isPortableInitializer(declaration.getInitializer())) return false

  const references = collectReferences(declaration)
  if (references.exportSpecifiers.length > 0) return false
  if (references.uses.length === 0) return false
  if (references.uses.some(use => isMemberName(use))) return false
  if (references.importSpecifiers.length !== 1) return false

  const specifier = references.importSpecifiers[0]
  if (specifier.getAliasNode()) return false

  const consumers = groupByFile(references.uses)
  if (consumers.size !== 1) return false

  const [target] = [...consumers.keys()]
  if (target.getFilePath() === declaration.getSourceFile().getFilePath()) return false
  if (specifier.getSourceFile().getFilePath() !== target.getFilePath()) return false

  const text = printDeclaration(declaration)

  removeDeclaration(declaration)
  removeImportSpecifier(specifier)
  insertAfterImports(target, text)
  return true
}

function deleteStrippedFiles(project: Project, stripped: Set<string>) {
  for (const path of stripped) {
    const file = project.getSourceFile(path)
    if (!file) continue
    if (hasExports(file)) continue
    if (!hasOnlyImports(file)) continue

    deleteFile(project, file)
  }
}

function collectReferences(declaration: VariableDeclaration): DeclarationReferences {
  const references: DeclarationReferences = { uses: [], importSpecifiers: [], exportSpecifiers: [] }

  const nameNode = declaration.getNameNode()
  if (!Node.isIdentifier(nameNode)) return references

  for (const node of nameNode.findReferencesAsNodes()) {
    if (node.compilerNode === nameNode.compilerNode) continue

    const parent = node.getParent()
    if (parent && Node.isImportSpecifier(parent)) {
      references.importSpecifiers.push(parent)
      continue
    }
    if (parent && Node.isExportSpecifier(parent)) {
      references.exportSpecifiers.push(parent)
      continue
    }
    if (!Node.isIdentifier(node)) continue

    references.uses.push(node)
  }

  return references
}

function isPortableInitializer(node: Node | undefined): boolean {
  if (!node) return false
  if (isSimpleLiteral(node)) return true
  if (Node.isTrueLiteral(node)) return true
  if (Node.isFalseLiteral(node)) return true
  if (Node.isNullLiteral(node)) return true
  if (Node.isAsExpression(node)) return isPortableInitializer(node.getExpression())
  if (Node.isParenthesizedExpression(node)) return isPortableInitializer(node.getExpression())
  if (Node.isArrayLiteralExpression(node)) return node.getElements().every(element => isPortableInitializer(element))
  if (Node.isObjectLiteralExpression(node)) return node.getProperties().every(property => isPortableProperty(property))
  return false
}

function isPortableProperty(property: Node): boolean {
  if (!Node.isPropertyAssignment(property)) return false
  const name = property.getNameNode()
  const staticName = Node.isIdentifier(name) || Node.isStringLiteral(name) || Node.isNumericLiteral(name)
  return staticName && isPortableInitializer(property.getInitializer())
}

function printDeclaration(declaration: VariableDeclaration): string {
  const statement = declaration.getVariableStatement()
  const comments =
    statement && statement.getDeclarations().length === 1
      ? statement.getLeadingCommentRanges().map(range => range.getText())
      : []

  const type = declaration.getTypeNode()
  const initializer = declaration.getInitializer()
  const annotation = type ? `: ${type.getText()}` : ""
  const value = initializer ? ` = ${initializer.getText()}` : ""

  return [...comments, `const ${declaration.getName()}${annotation}${value}`].join("\n")
}

function isNamedContext(use: Node): boolean {
  const parent = use.getParent()
  if (!parent) return false

  if (Node.isShorthandPropertyAssignment(parent)) return true

  if (Node.isJsxExpression(parent)) {
    const attribute = parent.getParent()
    return !!attribute && Node.isJsxAttribute(attribute)
  }

  if (Node.isBinaryExpression(parent)) {
    const isAssignment = parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken
    return isAssignment && parent.getRight() === use
  }

  const holder = parent as unknown as { getInitializer?: () => Node | undefined }
  if (typeof holder.getInitializer !== "function") return false
  return holder.getInitializer() === use
}

function getInlineEdit(use: Node, name: string, value: string): InlineEdit {
  const parent = use.getParent()
  if (parent && Node.isShorthandPropertyAssignment(parent)) return { node: parent, text: `${name}: ${value}` }
  if (isNamedContext(use)) return { node: use, text: value }
  return { node: use, text: `/* ${name} */ ${value}` }
}

function applyInlineEdits(edits: InlineEdit[]): void {
  const ordered = [...edits].sort((a, b) => b.node.getStart() - a.node.getStart())
  for (const edit of ordered) {
    if (edit.node.wasForgotten()) continue
    edit.node.replaceWithText(edit.text)
  }
}
