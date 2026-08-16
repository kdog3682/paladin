import { ModuleKind, ModuleResolutionKind, Node, Project, QuoteKind, ScriptTarget } from 'ts-morph'
import type { CompilerOptions, ExportDeclaration, ImportDeclaration, SourceFile } from 'ts-morph'
import {
  addNamedImport,
  addUnique,
  applySemicolonStyle,
  contains,
  declarationName,
  editResult,
  fail,
  filePathMatches,
  findDeclarations,
  importCandidatePaths,
  insertAfterImports,
  isExportedDeclaration,
  isImportBinding,
  localDependencyDeclarations,
  moduleSpecifierBase,
  moduleSpecifierFor,
  normalizePath,
  posix,
  rebaseModuleSpecifier,
  referenceNodes,
  removeStatement,
  removeUnusedImports,
  resolveNewFilePath,
  setExported,
  statementOf,
  topLevelDeclarations,
  usesSemicolons,
} from './utils'
import type { EditResult, SemicolonStyle } from './utils'

export type TypescriptServiceOptions = {
  inMemory?: boolean
  tsConfigFilePath?: string
  importExtension?: string
  quoteKind?: QuoteKind
  semicolons?: SemicolonStyle
}

type ImportNeed = {
  style: 'named' | 'default' | 'namespace'
  moduleSpecifier: string
  resolvedPath?: string
  name?: string
  alias?: string
  isTypeOnly: boolean
}

const describeImportBinding = (binding: Node): ImportNeed | undefined => {
  const declaration = binding.getFirstAncestor(ancestor => Node.isImportDeclaration(ancestor))
  if (!declaration || !Node.isImportDeclaration(declaration)) return undefined
  const resolved = declaration.getModuleSpecifierSourceFile()
  const base = {
    moduleSpecifier: declaration.getModuleSpecifierValue(),
    resolvedPath: resolved ? posix(resolved.getFilePath()) : undefined,
    isTypeOnly: declaration.isTypeOnly(),
  }
  if (Node.isImportSpecifier(binding)) {
    return {
      ...base,
      style: 'named',
      name: binding.getName(),
      alias: binding.getAliasNode()?.getText(),
      isTypeOnly: base.isTypeOnly || binding.isTypeOnly(),
    }
  }
  if (Node.isNamespaceImport(binding)) return { ...base, style: 'namespace', name: binding.getName() }
  if (Node.isImportClause(binding)) {
    const defaultImport = binding.getDefaultImport()?.getText()
    if (!defaultImport) return undefined
    return { ...base, style: 'default', name: defaultImport }
  }
  return undefined
}

export const defaultCompilerOptions: CompilerOptions = {
  target: ScriptTarget.ESNext,
  module: ModuleKind.ESNext,
  moduleResolution: ModuleResolutionKind.Bundler,
  strict: true,
  skipLibCheck: true,
}

export class TypescriptService {
  readonly project: Project
  readonly dir: string
  readonly importExtension: string
  readonly semicolons: SemicolonStyle

  constructor(dir: string, options: TypescriptServiceOptions = {}) {
    this.dir = normalizePath(posix(dir))
    this.importExtension = options.importExtension ?? ''
    this.semicolons = options.semicolons ?? 'auto'
    const manipulationSettings = {
      quoteKind: options.quoteKind ?? QuoteKind.Single,
      useTrailingCommas: false,
    }
    if (options.inMemory) {
      this.project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: defaultCompilerOptions,
        manipulationSettings,
      })
      return
    }
    if (options.tsConfigFilePath) {
      this.project = new Project({ tsConfigFilePath: options.tsConfigFilePath, manipulationSettings })
      return
    }
    this.project = new Project({ compilerOptions: defaultCompilerOptions, manipulationSettings })
    this.project.addSourceFilesAtPaths([
      `${this.dir}/**/*.ts`,
      `${this.dir}/**/*.tsx`,
      `!${this.dir}/**/node_modules/**`,
      `!${this.dir}/**/dist/**`,
    ])
  }

  static inMemory(files: Record<string, string>, dir = '/') {
    const service = new TypescriptService(dir, { inMemory: true })
    for (const [path, text] of Object.entries(files)) service.createFile(path, text)
    return service
  }

  save() {
    this.project.saveSync()
  }

  files() {
    return this.project
      .getSourceFiles()
      .filter(file => !file.isDeclarationFile())
      .filter(file => !posix(file.getFilePath()).includes('/node_modules/'))
  }

  createFile(path: string, text: string) {
    return this.project.createSourceFile(this.absolute(path), text, { overwrite: true })
  }

  file(ref: string) {
    const wanted = normalizePath(posix(ref))
    const direct = this.project.getSourceFile(wanted)
    if (direct) return direct
    return this.files().find(file => filePathMatches(file.getFilePath(), wanted))
  }

  exists(ref: string) {
    const file = this.file(ref)
    return Boolean(file && !file.wasForgotten())
  }

  deleteFile(file: SourceFile) {
    const path = posix(file.getFilePath())
    file.delete()
    const remaining = this.project.getSourceFile(path)
    if (remaining) this.project.removeSourceFile(remaining)
    return path
  }

  resolveImport(declaration: ImportDeclaration | ExportDeclaration) {
    const direct = declaration.getModuleSpecifierSourceFile()
    if (direct) return direct
    const base = moduleSpecifierBase(declaration)
    if (!base) return undefined
    for (const candidate of importCandidatePaths(base)) {
      const file = this.project.getSourceFile(candidate)
      if (file) return file
    }
    return undefined
  }

  importsFrom(consumer: SourceFile, filePath: string) {
    const wanted = posix(filePath)
    return consumer
      .getImportDeclarations()
      .filter(declaration => !declaration.wasForgotten())
      .filter(declaration => {
        const resolved = this.resolveImport(declaration)
        return Boolean(resolved && posix(resolved.getFilePath()) === wanted)
      })
  }

  text(ref: string) {
    return this.file(ref)?.getFullText() ?? ''
  }

  declaration(ref: string) {
    return findDeclarations(this.files(), ref)[0]
  }

  importersOf(file: SourceFile) {
    const path = posix(file.getFilePath())
    return this.files().filter(
      candidate => candidate !== file && this.importsFrom(candidate, path).length > 0,
    )
  }

  importersOfSymbol(file: SourceFile, name: string) {
    const path = posix(file.getFilePath())
    return this.files().filter(candidate => {
      if (candidate === file) return false
      return this.importsFrom(candidate, path).some(declaration =>
        declaration.getNamedImports().some(specifier => specifier.getName() === name),
      )
    })
  }

  renameFile(file: string, newName: string): EditResult {
    const result = editResult('renameFile', `${file} → ${newName}`)
    const source = this.file(file)
    if (!source) return fail(result, `file not found: ${file}`)
    const from = posix(source.getFilePath())
    const to = resolveNewFilePath(from, newName)
    if (from === to) {
      result.detail = 'already at target path'
      return result
    }
    if (this.project.getSourceFile(to)) return fail(result, `target already exists: ${to}`)
    for (const consumer of this.importersOf(source)) addUnique(result.changedFiles, posix(consumer.getFilePath()))
    source.move(to)
    result.deletedFiles.push(from)
    result.createdFiles.push(to)
    result.detail = `${result.changedFiles.length} importing file(s) updated`
    return this.finalize(result, this.semicolons)
  }

  renameSymbol(symbol: string, newName: string): EditResult {
    const result = editResult('renameSymbol', `${symbol} → ${newName}`)
    const declaration = this.declaration(symbol)
    if (!declaration) return fail(result, `symbol not found: ${symbol}`)
    const renameable = declaration as unknown as { rename?: (name: string) => void }
    if (typeof renameable.rename !== 'function') return fail(result, `symbol is not renameable: ${symbol}`)
    addUnique(result.changedFiles, posix(declaration.getSourceFile().getFilePath()))
    for (const reference of referenceNodes(declaration)) {
      addUnique(result.changedFiles, posix(reference.getSourceFile().getFilePath()))
    }
    renameable.rename(newName)
    result.detail = `${result.changedFiles.length} file(s) touched`
    return this.finalize(result, this.semicolons)
  }

  deleteSymbol(symbol: string): EditResult {
    const result = editResult('deleteSymbol', symbol)
    const declaration = this.declaration(symbol)
    if (!declaration) return fail(result, `symbol not found: ${symbol}`)
    const source = declaration.getSourceFile()
    const own = statementOf(declaration)
    const name = declarationName(declaration)
    for (const reference of referenceNodes(declaration)) {
      if (reference.wasForgotten()) continue
      if (contains(own, reference)) continue
      const file = reference.getSourceFile()
      const specifier = reference.getFirstAncestor(ancestor => Node.isImportSpecifier(ancestor))
      const exportSpecifier = reference.getFirstAncestor(ancestor => Node.isExportSpecifier(ancestor))
      if (specifier && Node.isImportSpecifier(specifier)) {
        const declarationOfImport = specifier.getImportDeclaration()
        specifier.remove()
        if (
          !declarationOfImport.wasForgotten() &&
          !declarationOfImport.getDefaultImport() &&
          !declarationOfImport.getNamespaceImport() &&
          declarationOfImport.getNamedImports().length === 0
        ) {
          declarationOfImport.remove()
        }
        addUnique(result.changedFiles, posix(file.getFilePath()))
        continue
      }
      if (exportSpecifier && Node.isExportSpecifier(exportSpecifier)) {
        exportSpecifier.remove()
        addUnique(result.changedFiles, posix(file.getFilePath()))
        continue
      }
      result.warnings.push(
        `dangling reference to ${name} in ${posix(file.getFilePath())}:${reference.getStartLineNumber()}`,
      )
    }
    removeStatement(own)
    removeUnusedImports(source)
    addUnique(result.changedFiles, posix(source.getFilePath()))
    result.detail = `removed ${name}`
    return this.finalize(result, this.semicolons)
  }

  moveSymbol(symbol: string, file: string): EditResult {
    const result = editResult('moveSymbol', `${symbol} → ${file}`)
    const declaration = this.declaration(symbol)
    if (!declaration) return fail(result, `symbol not found: ${symbol}`)
    const source = declaration.getSourceFile()
    const sourcePath = posix(source.getFilePath())
    const targetPath = this.resolveFileTarget(sourcePath, file)
    if (targetPath === sourcePath) {
      result.detail = 'already in target file'
      return result
    }

    let target = this.project.getSourceFile(targetPath)
    if (!target) {
      target = this.project.createSourceFile(targetPath, '', { overwrite: true })
      result.createdFiles.push(targetPath)
    }

    const moving = this.collectMoveSet(declaration)
    const hint = this.styleHintFor(source)
    const movingNames = moving.map(node => declarationName(node)).filter(name => name.length > 0)
    const movingStatements = moving
      .map(node => statementOf(node))
      .filter((node): node is Node => Boolean(node))
      .sort((left, right) => left.getStart() - right.getStart())

    const stayingDeps: Node[] = []
    const importDeps: Node[] = []
    for (const node of moving) {
      for (const dependency of localDependencyDeclarations(node)) {
        if (moving.includes(dependency)) continue
        if (isImportBinding(dependency)) {
          if (!importDeps.includes(dependency)) importDeps.push(dependency)
          continue
        }
        if (!stayingDeps.includes(dependency)) stayingDeps.push(dependency)
      }
    }
    const stayingNames = stayingDeps.map(node => declarationName(node)).filter(name => name.length > 0)
    const importNeeds = importDeps
      .map(binding => describeImportBinding(binding))
      .filter((need): need is ImportNeed => Boolean(need))

    const stillUsedInSource = moving.filter(node =>
      referenceNodes(node).some(
        reference =>
          reference.getSourceFile() === source &&
          !movingStatements.some(statement => contains(statement, reference)),
      ),
    )

    const consumers = this.files().filter(candidate => {
      if (candidate === source || candidate === target) return false
      return this.importsFrom(candidate, sourcePath).some(importDeclaration =>
        importDeclaration.getNamedImports().some(specifier => movingNames.includes(specifier.getName())),
      )
    })

    const exportedNames = new Set(
      moving
        .filter(node => isExportedDeclaration(node) || stillUsedInSource.includes(node))
        .map(node => declarationName(node)),
    )
    const backImportNames = stillUsedInSource.map(node => declarationName(node)).filter(name => name.length > 0)

    for (const node of moving) setExported(node, exportedNames.has(declarationName(node)))
    for (const dependency of stayingDeps) setExported(dependency, true)

    const freshStatements = movingNames
      .map(name => topLevelDeclarations(source).find(node => declarationName(node) === name))
      .filter((node): node is Node => Boolean(node))
      .map(node => statementOf(node))
      .filter((node): node is Node => Boolean(node))
    const uniqueStatements = [...new Set(freshStatements)].sort((left, right) => left.getStart() - right.getStart())
    for (const statement of uniqueStatements) {
      if (!Node.isVariableStatement(statement)) continue
      if (statement.getDeclarations().length > 1) {
        result.warnings.push(`${sourcePath} declares several bindings in one statement, all of them moved`)
      }
    }
    const texts = uniqueStatements.map(statement => statement.getText(true))

    for (const statement of [...uniqueStatements].reverse()) removeStatement(statement)

    insertAfterImports(target, texts.join('\n\n'))
    addUnique(result.changedFiles, targetPath)
    addUnique(result.changedFiles, sourcePath)

    for (const need of importNeeds) this.applyImportNeed(need, target, sourcePath, targetPath, result)

    if (stayingNames.length) {
      const specifier = moduleSpecifierFor(targetPath, sourcePath, this.importExtension)
      for (const name of stayingNames) addNamedImport(target, specifier, name)
    }

    if (backImportNames.length) {
      const specifier = moduleSpecifierFor(sourcePath, targetPath, this.importExtension)
      for (const name of backImportNames) addNamedImport(source, specifier, name)
      result.warnings.push(`${sourcePath} now imports back from ${targetPath}`)
    }

    removeUnusedImports(source)

    for (const consumer of [...consumers, target]) {
      const consumerPath = posix(consumer.getFilePath())
      for (const importDeclaration of this.importsFrom(consumer, sourcePath)) {
        if (importDeclaration.wasForgotten()) continue
        for (const specifier of [...importDeclaration.getNamedImports()]) {
          if (specifier.wasForgotten()) continue
          const name = specifier.getName()
          if (!movingNames.includes(name)) continue
          const alias = specifier.getAliasNode()?.getText()
          const isTypeOnly = specifier.isTypeOnly()
          specifier.remove()
          if (consumer === target) {
            if (alias && alias !== name) {
              result.warnings.push(`aliased import ${name} as ${alias} in ${consumerPath} needs manual review`)
            }
          } else {
            addNamedImport(
              consumer,
              moduleSpecifierFor(consumerPath, targetPath, this.importExtension),
              name,
              alias,
              isTypeOnly,
            )
          }
          addUnique(result.changedFiles, consumerPath)
        }
        const empty =
          !importDeclaration.wasForgotten() &&
          !importDeclaration.getDefaultImport() &&
          !importDeclaration.getNamespaceImport() &&
          importDeclaration.getNamedImports().length === 0
        if (empty) importDeclaration.remove()
      }
    }

    result.detail = `moved ${movingNames.join(', ')}`
    if (stayingNames.length) result.detail += ` · kept ${stayingNames.join(', ')} in place`
    return this.finalize(result, hint)
  }

  private styleHintFor(sourceFile: SourceFile): SemicolonStyle {
    if (this.semicolons !== 'auto') return this.semicolons
    return usesSemicolons(sourceFile) ? 'always' : 'never'
  }

  private finalize(result: EditResult, hint: SemicolonStyle) {
    for (const path of result.createdFiles) this.applyStyle(path, hint)
    for (const path of result.changedFiles) {
      if (result.createdFiles.includes(path)) continue
      this.applyStyle(path, this.semicolons)
    }
    return result
  }

  private applyStyle(path: string, style: SemicolonStyle) {
    const file = this.project.getSourceFile(path)
    if (!file || file.wasForgotten()) return
    applySemicolonStyle(file, style)
  }

  private absolute(path: string) {
    const raw = posix(path)
    if (raw.startsWith('/')) return normalizePath(raw)
    const base = this.dir === '/' ? '' : this.dir
    return normalizePath(`${base}/${raw}`)
  }

  private resolveFileTarget(fromFilePath: string, ref: string) {
    if (ref.startsWith('.')) return resolveNewFilePath(fromFilePath, ref)
    const existing = this.file(ref)
    if (existing) return posix(existing.getFilePath())
    const absolute = this.absolute(ref)
    return /\.(ts|tsx)$/.test(absolute) ? absolute : `${absolute}.ts`
  }

  private collectMoveSet(root: Node) {
    const moving = new Set<Node>([root])
    let grew = true
    while (grew) {
      grew = false
      for (const node of [...moving]) {
        for (const dependency of localDependencyDeclarations(node)) {
          if (moving.has(dependency)) continue
          if (isImportBinding(dependency)) continue
          if (!this.canMoveWith(dependency, moving)) continue
          moving.add(dependency)
          grew = true
        }
      }
    }
    return [...moving].sort((left, right) => left.getStart() - right.getStart())
  }

  private canMoveWith(dependency: Node, moving: Set<Node>) {
    if (isExportedDeclaration(dependency)) return false
    const own = statementOf(dependency)
    const statements = [...moving].map(node => statementOf(node)).filter((node): node is Node => Boolean(node))
    for (const reference of referenceNodes(dependency)) {
      if (contains(own, reference)) continue
      if (reference.getSourceFile() !== dependency.getSourceFile()) return false
      if (!statements.some(statement => contains(statement, reference))) return false
    }
    return true
  }

  private applyImportNeed(
    need: ImportNeed,
    target: SourceFile,
    sourcePath: string,
    targetPath: string,
    result: EditResult,
  ) {
    const specifier = need.resolvedPath
      ? moduleSpecifierFor(targetPath, need.resolvedPath, this.importExtension)
      : rebaseModuleSpecifier(sourcePath, targetPath, need.moduleSpecifier, this.importExtension)

    if (need.style === 'named' && need.name) {
      addNamedImport(target, specifier, need.name, need.alias, need.isTypeOnly)
      return
    }
    if (need.style === 'namespace' && need.name) {
      const already = target
        .getImportDeclarations()
        .some(declaration => declaration.getNamespaceImport()?.getText() === need.name)
      if (!already) target.addImportDeclaration({ moduleSpecifier: specifier, namespaceImport: need.name })
      return
    }
    if (need.style === 'default' && need.name) {
      const already = target
        .getImportDeclarations()
        .some(declaration => declaration.getDefaultImport()?.getText() === need.name)
      if (!already) target.addImportDeclaration({ moduleSpecifier: specifier, defaultImport: need.name })
      return
    }
    result.warnings.push(`unhandled import binding for ${targetPath}`)
  }
}

export type { EditResult } from './utils'
