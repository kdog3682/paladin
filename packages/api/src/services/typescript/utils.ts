import { Node, SyntaxKind } from 'ts-morph'
import type { ExportDeclaration, ImportDeclaration, SourceFile } from 'ts-morph'

export type EditResult = {
  ok: boolean
  kind: string
  target: string
  detail: string
  changedFiles: string[]
  createdFiles: string[]
  deletedFiles: string[]
  warnings: string[]
  errors: string[]
}

export const editResult = (kind: string, target: string): EditResult => ({
  ok: true,
  kind,
  target,
  detail: '',
  changedFiles: [],
  createdFiles: [],
  deletedFiles: [],
  warnings: [],
  errors: [],
})

export const fail = (result: EditResult, message: string): EditResult => {
  result.ok = false
  result.errors.push(message)
  return result
}

export const addUnique = (list: string[], value: string | undefined) => {
  if (!value) return
  if (!list.includes(value)) list.push(value)
}

export const posix = (value: string) => value.replace(/\\/g, '/')

export const normalizePath = (input: string) => {
  const raw = posix(input)
  const absolute = raw.startsWith('/')
  const out: string[] = []
  for (const part of raw.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop()
      else if (!absolute) out.push('..')
      continue
    }
    out.push(part)
  }
  return `${absolute ? '/' : ''}${out.join('/')}` || (absolute ? '/' : '.')
}

export const dirnameOf = (value: string) => {
  const parts = posix(value).split('/')
  parts.pop()
  const joined = parts.join('/')
  return joined || (posix(value).startsWith('/') ? '/' : '.')
}

export const basenameOf = (value: string) => posix(value).split('/').pop() ?? ''

const sourceExtension = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/

export const resolveNewFilePath = (fromFilePath: string, newName: string) => {
  const from = posix(fromFilePath)
  const extension = sourceExtension.exec(from)?.[0] ?? '.ts'
  const raw = posix(newName)
  const joined = raw.startsWith('/') ? raw : `${dirnameOf(from)}/${raw}`
  const resolved = normalizePath(joined)
  return sourceExtension.test(resolved) ? resolved : `${resolved}${extension}`
}

export const moduleSpecifierFor = (fromFilePath: string, toFilePath: string, extension = '') => {
  const fromParts = dirnameOf(posix(fromFilePath)).split('/')
  const toParts = posix(toFilePath).replace(/\.(ts|tsx|mts|cts)$/, '').split('/')
  const file = toParts.pop() ?? ''
  while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
    fromParts.shift()
    toParts.shift()
  }
  const up = fromParts.filter(part => part !== '').map(() => '..')
  const segments = [...up, ...toParts.filter(part => part !== ''), file]
  const joined = segments.join('/')
  const specifier = joined.startsWith('.') ? joined : `./${joined}`
  return `${specifier}${extension}`
}

export const rebaseModuleSpecifier = (
  fromFilePath: string,
  toFilePath: string,
  specifier: string,
  extension = '',
) => {
  if (!specifier.startsWith('.')) return specifier
  const absolute = normalizePath(`${dirnameOf(posix(fromFilePath))}/${specifier}`)
  return moduleSpecifierFor(toFilePath, absolute, extension)
}

export const filePathMatches = (filePath: string, ref: string) => {
  const actual = posix(filePath)
  const wanted = normalizePath(posix(ref))
  if (actual === wanted) return true
  const suffix = wanted.startsWith('/') ? wanted : `/${wanted}`
  return actual.endsWith(suffix)
}

export const globToRegExp = (glob: string) => {
  let body = ''
  let index = 0
  while (index < glob.length) {
    const char = glob[index]
    if (char === '*') {
      const doubled = glob[index + 1] === '*'
      if (doubled && glob[index + 2] === '/') {
        body += '(?:[^/]*/)*'
        index += 3
        continue
      }
      if (doubled) {
        body += '.*'
        index += 2
        continue
      }
      body += '[^/]*'
      index += 1
      continue
    }
    if (char === '?') {
      body += '[^/]'
      index += 1
      continue
    }
    body += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    index += 1
  }
  return new RegExp(`^${body}$`)
}

export const matchesAnyGlob = (filePath: string, patterns: string[]) => {
  const absolute = posix(filePath)
  const relative = absolute.replace(/^\//, '')
  return patterns.some(pattern => {
    const matcher = globToRegExp(pattern)
    return matcher.test(absolute) || matcher.test(relative)
  })
}

export const importCandidatePaths = (base: string) => [
  `${base}.ts`,
  `${base}.tsx`,
  `${base}/index.ts`,
  `${base}/index.tsx`,
  base,
]

export const moduleSpecifierBase = (declaration: ImportDeclaration | ExportDeclaration) => {
  const value = declaration.getModuleSpecifierValue()
  if (!value || !value.startsWith('.')) return undefined
  return normalizePath(`${dirnameOf(posix(declaration.getSourceFile().getFilePath()))}/${value}`)
}

export type SemicolonStyle = 'auto' | 'always' | 'never'

export const usesSemicolons = (sourceFile: SourceFile) => {
  const statements = sourceFile.getStatements()
  if (!statements.length) return false
  let withSemicolon = 0
  for (const statement of statements) {
    if (statement.getText().trimEnd().endsWith(';')) withSemicolon += 1
  }
  return withSemicolon * 2 > statements.length
}

export const stripSemicolons = (sourceFile: SourceFile) => {
  const positions: number[] = []
  for (const token of sourceFile.getDescendantsOfKind(SyntaxKind.SemicolonToken)) {
    const parent = token.getParent()
    if (!parent) continue
    if (parent.getKind() === SyntaxKind.ForStatement) continue
    if (parent.getKind() === SyntaxKind.EmptyStatement) continue
    if (token.getEnd() !== parent.getEnd()) continue
    positions.push(token.getStart())
  }
  for (const position of positions.reverse()) sourceFile.removeText(position, position + 1)
  return positions.length
}

export const applySemicolonStyle = (sourceFile: SourceFile, style: SemicolonStyle) => {
  if (style === 'always') return 0
  if (style === 'auto' && usesSemicolons(sourceFile)) return 0
  return stripSemicolons(sourceFile)
}

export const declarationKinds = new Set([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.ClassDeclaration,
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.EnumDeclaration,
  SyntaxKind.ModuleDeclaration,
  SyntaxKind.VariableDeclaration,
])

export const topLevelDeclarations = (sourceFile: SourceFile) => {
  const found: Node[] = []
  for (const statement of sourceFile.getStatements()) {
    if (Node.isVariableStatement(statement)) {
      found.push(...statement.getDeclarations())
      continue
    }
    if (declarationKinds.has(statement.getKind())) found.push(statement)
  }
  return found
}

export const declarationName = (node: Node) => {
  const named = node as unknown as { getName?: () => string | undefined }
  return typeof named.getName === 'function' ? named.getName() ?? '' : ''
}

export const statementOf = (node: Node): Node | undefined => {
  if (Node.isVariableDeclaration(node)) return node.getVariableStatement()
  let current: Node | undefined = node
  while (current) {
    const parent = current.getParent()
    if (!parent) return undefined
    if (parent.getKind() === SyntaxKind.SourceFile) return current
    current = parent
  }
  return undefined
}

export const isTopLevelDeclaration = (node: Node) => {
  const owner = Node.isVariableDeclaration(node) ? node.getVariableStatement() : node
  return owner?.getParent()?.getKind() === SyntaxKind.SourceFile
}

export const isImportBinding = (node: Node) =>
  Node.isImportSpecifier(node) || Node.isImportClause(node) || Node.isNamespaceImport(node)

const exportableOf = (node: Node) => {
  const owner = Node.isVariableDeclaration(node) ? node.getVariableStatement() : node
  const candidate = owner as unknown as {
    isExported?: () => boolean
    setIsExported?: (value: boolean) => void
  }
  if (!candidate) return undefined
  if (typeof candidate.isExported !== 'function') return undefined
  if (typeof candidate.setIsExported !== 'function') return undefined
  return candidate
}

export const isExportedDeclaration = (node: Node) => Boolean(exportableOf(node)?.isExported?.())

export const setExported = (node: Node, value: boolean) => {
  exportableOf(node)?.setIsExported?.(value)
}

export const referenceNodes = (node: Node): Node[] => {
  const findable = node as unknown as { findReferencesAsNodes?: () => Node[] }
  if (typeof findable.findReferencesAsNodes !== 'function') return []
  try {
    return findable.findReferencesAsNodes()
  } catch {
    return []
  }
}

export const contains = (container: Node | undefined, node: Node) => {
  if (!container || container.wasForgotten() || node.wasForgotten()) return false
  if (container.getSourceFile() !== node.getSourceFile()) return false
  return node.getStart() >= container.getStart() && node.getEnd() <= container.getEnd()
}

export const localDependencyDeclarations = (node: Node) => {
  const sourceFile = node.getSourceFile()
  const found: Node[] = []
  const seen = new Set<Node>()
  for (const identifier of node.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const symbol = identifier.getSymbol()
    if (!symbol) continue
    for (const declaration of symbol.getDeclarations()) {
      if (declaration === node) continue
      if (declaration.getSourceFile() !== sourceFile) continue
      if (seen.has(declaration)) continue
      if (contains(node, declaration)) continue
      if (!isImportBinding(declaration) && !isTopLevelDeclaration(declaration)) continue
      if (!isImportBinding(declaration) && !declarationKinds.has(declaration.getKind())) continue
      seen.add(declaration)
      found.push(declaration)
    }
  }
  return found
}

export const removeStatement = (node: Node | undefined) => {
  if (!node || node.wasForgotten()) return false
  const removable = node as unknown as { remove?: () => void }
  if (typeof removable.remove !== 'function') return false
  removable.remove()
  return true
}

export const identifierUseCount = (sourceFile: SourceFile, name: string) => {
  let count = 0
  for (const identifier of sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (identifier.getText() !== name) continue
    if (identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)) continue
    count += 1
  }
  return count
}

export const removeUnusedImports = (sourceFile: SourceFile) => {
  let removed = 0
  for (const declaration of [...sourceFile.getImportDeclarations()]) {
    if (declaration.wasForgotten()) continue
    if (!declaration.getImportClause()) continue
    const defaultImport = declaration.getDefaultImport()
    if (defaultImport && identifierUseCount(sourceFile, defaultImport.getText()) === 0) {
      declaration.removeDefaultImport()
      removed += 1
    }
    const namespaceImport = declaration.getNamespaceImport()
    if (namespaceImport && identifierUseCount(sourceFile, namespaceImport.getText()) === 0) {
      declaration.removeNamespaceImport()
      removed += 1
    }
    for (const specifier of [...declaration.getNamedImports()]) {
      if (specifier.wasForgotten()) continue
      const local = (specifier.getAliasNode() ?? specifier.getNameNode()).getText()
      if (identifierUseCount(sourceFile, local) > 0) continue
      specifier.remove()
      removed += 1
    }
    const empty =
      !declaration.getDefaultImport() &&
      !declaration.getNamespaceImport() &&
      declaration.getNamedImports().length === 0
    if (empty) declaration.remove()
  }
  return removed
}

export const addNamedImport = (
  sourceFile: SourceFile,
  moduleSpecifier: string,
  name: string,
  alias?: string,
  isTypeOnly = false,
) => {
  const local = alias ?? name
  const existing = sourceFile
    .getImportDeclarations()
    .find(declaration => declaration.getModuleSpecifierValue() === moduleSpecifier && !declaration.isTypeOnly())
  const target = existing ?? sourceFile.addImportDeclaration({ moduleSpecifier, namedImports: [] })
  const already = target
    .getNamedImports()
    .some(specifier => (specifier.getAliasNode() ?? specifier.getNameNode()).getText() === local)
  if (already) return
  target.addNamedImport({ name, alias, isTypeOnly })
}

export const insertAfterImports = (sourceFile: SourceFile, text: string) => {
  const statements = sourceFile.getStatements()
  let index = 0
  statements.forEach((statement, position) => {
    if (Node.isImportDeclaration(statement)) index = position + 1
  })
  sourceFile.insertStatements(index, text)
}

export const parseSymbolRef = (ref: string) => {
  if (ref.includes('#')) {
    const [file, name] = ref.split('#')
    return { file, name }
  }
  return { file: undefined, name: ref }
}

export const findDeclarations = (files: SourceFile[], ref: string) => {
  const { file, name } = parseSymbolRef(ref)
  const matches: Node[] = []
  for (const sourceFile of files) {
    if (file && !filePathMatches(sourceFile.getFilePath(), file)) continue
    for (const declaration of topLevelDeclarations(sourceFile)) {
      if (declarationName(declaration) === name) matches.push(declaration)
    }
  }
  return matches
}

export const countFunctions = (sourceFile: SourceFile) => {
  let count = sourceFile.getFunctions().length
  for (const statement of sourceFile.getStatements()) {
    if (!Node.isVariableStatement(statement)) continue
    for (const declaration of statement.getDeclarations()) {
      const initializer = declaration.getInitializer()
      if (!initializer) continue
      if (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer)) count += 1
    }
  }
  for (const declaration of sourceFile.getClasses()) count += declaration.getMethods().length
  return count
}

export const lineCount = (sourceFile: SourceFile) => sourceFile.getFullText().split('\n').length

export const exportedDeclarationNames = (sourceFile: SourceFile) =>
  topLevelDeclarations(sourceFile)
    .filter(declaration => isExportedDeclaration(declaration))
    .map(declaration => declarationName(declaration))
    .filter(name => name.length > 0)
