import { Node } from 'ts-morph'
import type { ImportSpecifier, SourceFile } from 'ts-morph'
import type { TypescriptService } from '../..'
import {
  addNamedImport,
  addUnique,
  applySemicolonStyle,
  editResult,
  fail,
  moduleSpecifierFor,
  posix,
  removeUnusedImports,
} from '../../utils'
import type { EditResult } from '../../utils'

export type RemapSymbolsOptions = {
  from: string
  to: string
  symbols: Record<string, string>
  deleteSource?: boolean
}

type PendingImport = {
  name: string
  alias?: string
  isTypeOnly: boolean
}

type PendingEdit = {
  start: number
  end: number
  text: string
}

const exportedNames = (file: SourceFile) => new Set(file.getExportedDeclarations().keys())

const localName = (specifier: ImportSpecifier) => specifier.getAliasNode()?.getText() ?? specifier.getName()

const referenceEdits = (specifier: ImportSpecifier, newName: string): PendingEdit[] => {
  const file = specifier.getSourceFile()
  const nameNode = specifier.getAliasNode() ?? specifier.getNameNode()
  const edits: PendingEdit[] = []
  for (const node of nameNode.findReferencesAsNodes()) {
    if (node.getSourceFile() !== file) continue
    if (node.getFirstAncestor(ancestor => Node.isImportDeclaration(ancestor))) continue
    const parent = node.getParent()
    if (parent && Node.isShorthandPropertyAssignment(parent)) {
      edits.push({ start: parent.getStart(), end: parent.getEnd(), text: `${node.getText()}: ${newName}` })
      continue
    }
    edits.push({ start: node.getStart(), end: node.getEnd(), text: newName })
  }
  return edits
}

const warnOnCollisions = (
  service: TypescriptService,
  consumer: SourceFile,
  consumerPath: string,
  targetPath: string,
  names: string[],
  result: EditResult,
) => {
  for (const declaration of consumer.getImportDeclarations()) {
    const resolved = service.resolveImport(declaration)
    if (resolved && posix(resolved.getFilePath()) === targetPath) continue
    for (const specifier of declaration.getNamedImports()) {
      const bound = localName(specifier)
      if (!names.includes(bound)) continue
      result.warnings.push(`${consumerPath} already binds ${bound} from ${declaration.getModuleSpecifierValue()}`)
    }
  }
}

const rewriteImports = (
  service: TypescriptService,
  consumer: SourceFile,
  sourcePath: string,
  targetPath: string,
  symbols: Record<string, string>,
  result: EditResult,
) => {
  const consumerPath = posix(consumer.getFilePath())
  const declarations = service.importsFrom(consumer, sourcePath)
  if (!declarations.length) return

  const pending: PendingImport[] = []
  const seen = new Set<string>()
  const edits: PendingEdit[] = []

  for (const declaration of declarations) {
    if (declaration.getDefaultImport() || declaration.getNamespaceImport()) {
      result.warnings.push(`${consumerPath} uses a default or namespace import of ${sourcePath}, review manually`)
    }
    for (const specifier of declaration.getNamedImports()) {
      const name = specifier.getName()
      const newName = symbols[name]
      if (!newName) {
        result.warnings.push(`${consumerPath} imports ${name} from ${sourcePath} and it has no replacement`)
        continue
      }
      const alias = specifier.getAliasNode()?.getText()
      const isTypeOnly = declaration.isTypeOnly() || specifier.isTypeOnly()
      const key = `${newName}|${alias ?? ''}|${isTypeOnly}`
      if (!seen.has(key)) {
        seen.add(key)
        pending.push({ name: newName, alias, isTypeOnly })
      }
      if (!alias && newName !== name) edits.push(...referenceEdits(specifier, newName))
    }
  }

  if (!pending.length) return

  warnOnCollisions(
    service,
    consumer,
    consumerPath,
    targetPath,
    pending.map(need => need.alias ?? need.name),
    result,
  )

  for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
    consumer.replaceText([edit.start, edit.end], edit.text)
  }

  for (const declaration of service.importsFrom(consumer, sourcePath)) {
    if (declaration.wasForgotten()) continue
    for (const specifier of [...declaration.getNamedImports()]) {
      if (specifier.wasForgotten()) continue
      if (!symbols[specifier.getName()]) continue
      specifier.remove()
    }
    const empty =
      !declaration.wasForgotten() &&
      !declaration.getDefaultImport() &&
      !declaration.getNamespaceImport() &&
      declaration.getNamedImports().length === 0
    if (empty) declaration.remove()
  }

  const specifierText = moduleSpecifierFor(consumerPath, targetPath, service.importExtension)
  for (const need of pending) addNamedImport(consumer, specifierText, need.name, need.alias, need.isTypeOnly)

  removeUnusedImports(consumer)
  addUnique(result.changedFiles, consumerPath)
}

const rewriteReExports = (
  service: TypescriptService,
  consumer: SourceFile,
  sourcePath: string,
  targetPath: string,
  symbols: Record<string, string>,
  result: EditResult,
) => {
  const consumerPath = posix(consumer.getFilePath())
  for (const declaration of [...consumer.getExportDeclarations()]) {
    if (declaration.wasForgotten()) continue
    if (!declaration.getModuleSpecifier()) continue
    const resolved = service.resolveImport(declaration)
    if (!resolved || posix(resolved.getFilePath()) !== sourcePath) continue
    const specifierText = moduleSpecifierFor(consumerPath, targetPath, service.importExtension)

    if (declaration.isNamespaceExport()) {
      declaration.setModuleSpecifier(specifierText)
      result.warnings.push(`${consumerPath} now re-exports all of ${targetPath}, review manually`)
      addUnique(result.changedFiles, consumerPath)
      continue
    }

    const moved: PendingImport[] = []
    for (const named of [...declaration.getNamedExports()]) {
      if (named.wasForgotten()) continue
      const name = named.getName()
      const newName = symbols[name]
      if (!newName) {
        result.warnings.push(`${consumerPath} re-exports ${name} from ${sourcePath} and it has no replacement`)
        continue
      }
      const existing = named.getAliasNode()?.getText()
      const alias = existing ?? (newName === name ? undefined : name)
      if (alias) {
        result.warnings.push(`${consumerPath} keeps exporting ${newName} under the name ${alias}, review manually`)
      }
      moved.push({ name: newName, alias, isTypeOnly: declaration.isTypeOnly() || named.isTypeOnly() })
      named.remove()
    }
    if (!moved.length) continue

    if (!declaration.wasForgotten() && declaration.getNamedExports().length === 0) declaration.remove()
    consumer.addExportDeclaration({
      moduleSpecifier: specifierText,
      namedExports: moved.map(entry => ({ name: entry.name, alias: entry.alias })),
      isTypeOnly: moved.every(entry => entry.isTypeOnly),
    })
    addUnique(result.changedFiles, consumerPath)
  }
}

const finalize = (service: TypescriptService, result: EditResult) => {
  for (const path of result.changedFiles) {
    const file = service.project.getSourceFile(path)
    if (!file || file.wasForgotten()) continue
    applySemicolonStyle(file, service.semicolons)
  }
  return result
}

export const remapSymbols = (service: TypescriptService, options: RemapSymbolsOptions): EditResult => {
  const deleteSource = options.deleteSource ?? true
  const result = editResult('remapSymbols', `${options.from} → ${options.to}`)

  const source = service.file(options.from)
  if (!source) return fail(result, `file not found: ${options.from}`)
  const target = service.file(options.to)
  if (!target) return fail(result, `file not found: ${options.to}`)

  const sourcePath = posix(source.getFilePath())
  const targetPath = posix(target.getFilePath())
  if (sourcePath === targetPath) return fail(result, `from and to resolve to the same file: ${sourcePath}`)

  const pairs = Object.entries(options.symbols)
  if (!pairs.length) return fail(result, 'no symbols given')

  const available = exportedNames(target)
  for (const [, newName] of pairs) {
    if (!available.has(newName)) result.warnings.push(`${targetPath} does not export ${newName}`)
  }

  for (const consumer of service.files()) {
    if (consumer.wasForgotten()) continue
    if (posix(consumer.getFilePath()) === sourcePath) continue
    rewriteImports(service, consumer, sourcePath, targetPath, options.symbols, result)
    rewriteReExports(service, consumer, sourcePath, targetPath, options.symbols, result)
  }

  if (deleteSource) {
    for (const holdout of service.importersOf(source)) {
      result.warnings.push(`${posix(holdout.getFilePath())} still imports ${sourcePath}`)
    }
    result.deletedFiles.push(service.deleteFile(source))
  }

  const summary = pairs.map(([oldName, newName]) => `${oldName} → ${newName}`).join(', ')
  result.detail = `${summary} · ${result.changedFiles.length} file(s) updated`
  return finalize(service, result)
}
