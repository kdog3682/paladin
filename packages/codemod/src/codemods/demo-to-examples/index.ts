import { createHash } from "node:crypto"
import {
  Node,
  type CallExpression,
  type ExpressionStatement,
  type FunctionDeclarationStructure,
  type OptionalKind,
  type Project,
  type SourceFile,
  type Statement,
} from "ts-morph"
import { getDeclarationsNamed } from "../../utils/declarations"
import { removeUnusedImports } from "../../utils/imports"
import { getLocalDependencies, isOnlyReferencedWithin } from "../../utils/references"
import { removeUnusedSymbols } from "../../utils/removeUnusedSymbols"

const DEMO_FILE = /\.demo\.([cm]?[jt]sx?)$/

/** names a function declaration can't take */
const RESERVED = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete",
  "do", "else", "enum", "export", "extends", "false", "finally", "for", "function", "if",
  "import", "in", "instanceof", "new", "null", "return", "super", "switch", "this", "throw",
  "true", "try", "typeof", "var", "void", "while", "with", "let", "static", "yield", "await",
  "implements", "interface", "package", "private", "protected", "public", "arguments", "eval",
])

type Example = {
  /** the label passed to demo.run before the value, if any */
  label?: string
  /** the value the example shows */
  value: Node
  /** the module-scope statements inlined into the example, in source order */
  statements: Statement[]
}

/**
 * Turns every `*.demo.ts` file into a `*.examples.ts` file: each labelled value passed to
 * `demo.run(...)` becomes an exported function named after its label that returns the value.
 * Module-scope variables the value relies on are inlined into the function, together with the
 * statements that act on them (`a.moveTo(b)`). Functions, classes and types stay at module
 * scope, and so does anything they rely on. Afterwards, exports of the example files and of
 * modules that only the demos imported are removed once nothing uses them. Returns the
 * converted files.
 */
export function demoToExamples(project: Project): SourceFile[] {
  const demoFiles = project.getSourceFiles().filter(file => DEMO_FILE.test(file.getBaseName()))
  const helperFiles = getDemoOnlyModules(demoFiles)
  const exampleNames = new Map<SourceFile, Set<string>>()

  for (const file of demoFiles) {
    const names = convertFile(file)
    if (!names) continue
    removeUnusedImports(file)
    ensureBlankLineAfterImports(file)
    const path = file.getFilePath().replace(DEMO_FILE, ".examples.$1")
    if (project.getSourceFile(path)) throw new Error(`demoToExamples: ${path} already exists`)
    file.move(path)
    exampleNames.set(file, names)
  }

  const converted = [...exampleNames.keys()]
  removeUnusedSymbols(project, {
    files: [...converted, ...helperFiles],
    keep: statement =>
      Node.isFunctionDeclaration(statement) &&
      !!exampleNames.get(statement.getSourceFile())?.has(statement.getName() ?? ""),
  })
  return converted
}

/** Rewrites the demo.run calls of a file into example functions, returning their names, or undefined when the file has none. */
function convertFile(file: SourceFile): Set<string> | undefined {
  const demoNames = getDemoNames(file)
  const runs = file.getStatements().flatMap(statement => {
    const call = getDemoRunCall(statement, demoNames)
    return call ? [{ statement, call }] : []
  })
  if (!runs.length) return

  const runStatements = runs.map(run => run.statement)
  const inlinable = getInlinable(file, runStatements)
  const actions = [...inlinable].filter(Node.isExpressionStatement)

  const planned = runs.map(run =>
    getExamples(run.call).map(({ label, value }): Example => ({
      label,
      value,
      statements: collectStatements(value, inlinable, actions),
    })),
  )

  // a statement moves out of module scope only when nothing left behind still needs it
  const consumed = [...new Set(planned.flat().flatMap(example => example.statements))]
  const removable = consumed.filter(statement =>
    Node.isExpressionStatement(statement) ||
    isOnlyReferencedWithin(statement, [...consumed, ...runStatements]),
  )

  const importNames = getImportNames(file)
  const names = new Set<string>()
  const isTaken = (name: string) =>
    names.has(name) ||
    RESERVED.has(name) ||
    importNames.has(name) ||
    getDeclarationsNamed(file, name).some(declaration =>
      !removable.some(statement => statement.containsRange(declaration.getPos(), declaration.getEnd())),
    )

  const structures = planned.map(examples =>
    examples.map((example): OptionalKind<FunctionDeclarationStructure> => {
      const base = (example.label && toFunctionName(example.label)) || hashName(example.value)
      const name = getUniqueName(base, isTaken)
      names.add(name)
      return {
        name,
        isExported: true,
        leadingTrivia: example.label ? `/* ${example.label.replaceAll("*/", "* /")} */\n` : undefined,
        statements: [buildBody(example.statements, example.value)],
      }
    }),
  )

  // last run first, so the indexes of the earlier ones still hold
  for (let i = runs.length - 1; i >= 0; i--) {
    const { statement } = runs[i]
    file.insertFunctions(statement.getChildIndex(), structures[i])
    statement.remove()
  }
  for (const statement of removable) statement.remove()

  return names
}

/**
 * Removing the statements that were inlined can take the blank line under the imports with
 * them, leaving the first example glued to the last import.
 */
function ensureBlankLineAfterImports(file: SourceFile): void {
  const lastImport = file.getImportDeclarations().at(-1)
  const next = lastImport?.getNextSibling()
  if (!lastImport || !next) return
  const between = file.getFullText().slice(lastImport.getEnd(), next.getStart(true))
  if (!/^[ \t]*\r?\n[ \t]*\r?\n/.test(between)) file.insertText(lastImport.getEnd(), "\n")
}

/** The local names `demo` is imported under in a file. */
function getDemoNames(file: SourceFile): Set<string> {
  const names = new Set<string>()
  for (const declaration of file.getImportDeclarations())
    for (const specifier of declaration.getNamedImports())
      if (specifier.getName() === "demo") names.add(specifier.getAliasNode()?.getText() ?? "demo")
  return names
}

/** Every local name the imports of a file bind. */
function getImportNames(file: SourceFile): Set<string> {
  const names = new Set<string>()
  for (const declaration of file.getImportDeclarations()) {
    const defaultImport = declaration.getDefaultImport()
    if (defaultImport) names.add(defaultImport.getText())
    const namespaceImport = declaration.getNamespaceImport()
    if (namespaceImport) names.add(namespaceImport.getText())
    for (const specifier of declaration.getNamedImports())
      names.add(specifier.getAliasNode()?.getText() ?? specifier.getName())
  }
  return names
}

/** Returns the call when a statement is `demo.run(...)` (optionally awaited). */
function getDemoRunCall(statement: Statement, demoNames: Set<string>): CallExpression | undefined {
  if (!Node.isExpressionStatement(statement)) return
  let expression = statement.getExpression()
  if (Node.isAwaitExpression(expression)) expression = expression.getExpression()
  if (!Node.isCallExpression(expression)) return
  const callee = expression.getExpression()
  if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== "run") return
  const target = callee.getExpression()
  if (Node.isIdentifier(target) && demoNames.has(target.getText())) return expression
}

/** Pairs the arguments of demo.run into labels and values; a value with no string before it has no label. */
function getExamples(call: CallExpression): { label?: string, value: Node }[] {
  const examples: { label?: string, value: Node }[] = []
  let label: string | undefined
  for (const argument of call.getArguments()) {
    if (label === undefined && (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument))) {
      label = argument.getLiteralText()
      continue
    }
    examples.push({ label, value: argument })
    label = undefined
  }
  if (label !== undefined)
    throw new Error(`demoToExamples: label "${label}" has no value in ${call.getSourceFile().getFilePath()}`)
  return examples
}

/**
 * The module-scope statements that may move into an example: variable statements nothing
 * outside the file uses, and expression statements. Whatever stays at module scope (functions,
 * classes, types, ...) keeps its variable dependencies there too.
 */
function getInlinable(file: SourceFile, runStatements: Statement[]): Set<Statement> {
  const statements = file.getStatements()
  const inlinable = new Set(statements.filter(statement => {
    if (runStatements.includes(statement)) return false
    if (Node.isExpressionStatement(statement)) return true
    if (!Node.isVariableStatement(statement)) return false
    return !statement.isExported() || isOnlyReferencedWithin(statement, statements)
  }))

  const stack = statements.filter(statement => !inlinable.has(statement) && !runStatements.includes(statement))
  while (stack.length) {
    for (const dependency of getLocalDependencies(stack.pop()!)) {
      const statement = dependency as Statement
      if (inlinable.delete(statement)) stack.push(statement)
    }
  }
  return inlinable
}

/**
 * The inlinable statements a value needs: the variables it relies on, transitively, plus the
 * expression statements that touch any of them (`a.moveTo(b)`) and what those rely on.
 */
function collectStatements(value: Node, inlinable: Set<Statement>, actions: ExpressionStatement[]): Statement[] {
  const needed = new Set<Statement>()
  const visit = (node: Node) => {
    for (const dependency of getDependencies(node)) {
      const statement = dependency as Statement
      if (!inlinable.has(statement) || needed.has(statement)) continue
      needed.add(statement)
      visit(statement)
    }
  }
  visit(value)

  let grew = true
  while (grew) {
    grew = false
    for (const action of actions) {
      if (needed.has(action)) continue
      if (!getLocalDependencies(action).some(dependency => needed.has(dependency as Statement))) continue
      needed.add(action)
      visit(action)
      grew = true
    }
  }

  return [...needed].sort((a, b) => a.getPos() - b.getPos())
}

/**
 * The module-scope statements a node depends on. getLocalDependencies only looks at what is
 * inside the node, so a value that is itself a bare identifier (`demo.run("a", a)`) is
 * resolved here.
 */
function getDependencies(node: Node): Node[] {
  const dependencies = getLocalDependencies(node)
  if (!Node.isIdentifier(node)) return dependencies

  const file = node.getSourceFile()
  for (const declaration of node.getSymbol()?.getDeclarations() ?? []) {
    if (declaration.getSourceFile() !== file) continue
    const statement = declaration.getParentWhile(parent => !Node.isSourceFile(parent)) ?? declaration
    if (Node.isSourceFile(statement.getParent()) && !dependencies.includes(statement)) dependencies.push(statement)
  }
  return dependencies
}

/**
 * The body of an example function: the inlined statements, then the return. Single-line
 * statements sit directly on top of each other; a statement spanning several lines gets a blank
 * line between it and its neighbours.
 */
function buildBody(statements: Statement[], value: Node): string {
  const blocks = [...statements.map(getStatementText), `return ${getDedentedText(value)}`]
  return blocks
    .map((block, i) => {
      const previous = blocks[i - 1]
      const spaced = previous !== undefined && (previous.includes("\n") || block.includes("\n"))
      return spaced ? `\n${block}` : block
    })
    .join("\n")
}

/** A statement's text, comments included, without the `export` it no longer needs inside a function. */
function getStatementText(statement: Statement): string {
  const text = getDedentedText(statement, statement.getText(true))
  return Node.isVariableStatement(statement) && statement.isExported()
    ? text.replace(/^((?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*)export\s+/, "$1")
    : text
}

/** Strips the indentation of the node's first line from its other lines, so it can be re-indented elsewhere. */
function getDedentedText(node: Node, text = node.getText(true)): string {
  const indent = node.getIndentationText()
  if (!indent) return text
  return text
    .split("\n")
    .map((line, i) => i > 0 && line.startsWith(indent) ? line.slice(indent.length) : line)
    .join("\n")
}

/** camelCases a label into a function name: "default text fox" -> defaultTextFox. */
function toFunctionName(label: string): string {
  const words = label.match(/[A-Za-z0-9]+/g) ?? []
  let name = words
    .map((word, i) => {
      if (i > 0) return word.charAt(0).toUpperCase() + word.slice(1)
      return word === word.toUpperCase() ? word.toLowerCase() : word.charAt(0).toLowerCase() + word.slice(1)
    })
    .join("")
  if (!name) return ""
  if (/^\d/.test(name)) name = `example${name}`
  return name
}

/**
 * Names an unlabelled example after a 6 letter hash of its value. Only letters are used so the
 * name is always a valid identifier, and whitespace is collapsed first so reformatting the
 * demo doesn't change the name.
 */
function hashName(value: Node): string {
  const text = value.getText().replace(/\s+/g, " ")
  const bytes = createHash("sha1").update(text).digest()
  return [...bytes.subarray(0, 6)].map(byte => String.fromCharCode(97 + byte % 26)).join("")
}

/** Appends a counter to a name until it is free. */
function getUniqueName(base: string, isTaken: (name: string) => boolean): string {
  if (!isTaken(base)) return base
  for (let i = 2; ; i++) if (!isTaken(`${base}${i}`)) return `${base}${i}`
}

/**
 * Modules imported by demo files and by nothing else, other than the one providing `demo`
 * itself. Their exports existed to serve the demos, so they are pruned along with them.
 */
function getDemoOnlyModules(demoFiles: SourceFile[]): SourceFile[] {
  const demos = new Set(demoFiles)
  const runners = new Set<SourceFile>()
  const candidates = new Set<SourceFile>()
  for (const file of demoFiles) {
    for (const declaration of file.getImportDeclarations()) {
      const target = declaration.getModuleSpecifierSourceFile()
      if (!target || demos.has(target) || target.isInNodeModules() || target.isDeclarationFile()) continue
      if (declaration.getNamedImports().some(specifier => specifier.getName() === "demo")) runners.add(target)
      else candidates.add(target)
    }
  }
  return [...candidates].filter(target =>
    !runners.has(target) && target.getReferencingSourceFiles().every(file => demos.has(file)),
  )
}
