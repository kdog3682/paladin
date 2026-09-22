import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import {
  Node,
  SyntaxKind,
  ts,
  VariableDeclarationKind,
  type ClassDeclaration,
  type FunctionDeclaration,
  type Identifier,
  type MethodDeclaration,
  type ObjectBindingPattern,
  type ParameterDeclaration,
  type Project,
  type Type,
} from "ts-morph"
import { createProject } from "../project"

/*
docgen renders the api of classes and functions as typescript-looking signatures, using the type checker.
compared to reading the source text it can:

- expand `const { a = A, ...rest } = opts` in a body into `a: number = 48, ...rest: Partial<Style>`,
  with the types the checker knows rather than "unknown".
- inline `const` literals used as defaults (`WIDTH` -> `48`).
- drop methods and properties an ancestor class already declares. an override adds nothing to the api.
- pull in the interfaces and type aliases the signatures mention.

`docgen(project, names, { out })` is the codemod: it writes the markdown to `out` when given.
`docgenTargets` and `docgenPackage` are the same engine for callers that already know what to document.
*/

export type DocgenOptions = {
  /** Include private and protected members. Defaults to false. */
  includePrivate?: boolean
  /** Include doc comments for members. Defaults to true. */
  includeMemberDocs?: boolean
  /** Width before params and imports break across lines. Defaults to 80. */
  width?: number
  /** Package name. Adds an `import { ... } from "<package>"` line. */
  package?: string | null
  /** Whether a name is importable from the package. Type names are only listed in the import when they are. */
  exported?: (name: string) => boolean
}

export type DocTarget = {
  /** Name the symbol is exported under. */
  name: string
  node: Node
}

type Ctx = Required<Pick<DocgenOptions, "includePrivate" | "includeMemberDocs" | "width">> & {
  /** signature text, scanned afterwards for the types worth documenting */
  refs: string[]
}

const MAX_INLINE_VALUE = 60

/** codemod entry. `names` are what the package barrel exports; omitted means everything in the project's barrel. */
export function docgen(
  project: Project,
  names?: string | string[],
  options: DocgenOptions & { out?: string } = {},
): string {
  const { out, ...rest } = options
  const list = names === undefined ? undefined : Array.isArray(names) ? names : [names]
  const { targets, exported } = findTargets(project, list)
  const first = targets[0]?.node.getSourceFile().getFilePath()
  const markdown = docgenTargets(targets, {
    package: first ? packageName(first) : null,
    exported,
    ...rest,
  })
  if (out) {
    const cwd = project.getFileSystem().getCurrentDirectory()
    project.createSourceFile(join(cwd, out), markdown, { overwrite: true })
  }
  return markdown
}

/** Document declarations by `file` + local name, in a project built for the package containing them. */
export function docgenPackage(
  dir: string,
  symbols: { name: string, file: string, local: string }[],
  options: DocgenOptions = {},
): string {
  const project = createProject(dir)
  const targets: DocTarget[] = []
  for (const symbol of symbols) {
    const node = declarationIn(project, symbol.file, symbol.local)
    if (node) targets.push({ name: symbol.name, node })
  }
  return docgenTargets(targets, options)
}

export function docgenTargets(targets: DocTarget[], options: DocgenOptions = {}): string {
  const ctx: Ctx = {
    includePrivate: options.includePrivate ?? false,
    includeMemberDocs: options.includeMemberDocs !== false,
    width: options.width ?? 80,
    refs: [],
  }

  const symbols: string[] = []
  const requested = new Set(targets.map((target) => target.name))
  const bindings = new Map<string, string>()
  for (const { name, node } of targets) {
    const lines = renderDeclaration(name, node, ctx)
    if (lines.length === 0) continue
    symbols.push(lines.join("\n"))
    bindings.set(name, Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node) ? `type ${name}` : name)
  }
  if (symbols.length === 0) return ""

  const project = targets[0]!.node.getProject()
  const types = referencedTypes(project, ctx, requested)
  const typeBlocks = types.map((type) => renderType(type, ctx).join("\n"))
  for (const type of types) {
    const name = type.getName()!
    if (!bindings.has(name) && options.exported?.(name)) bindings.set(name, Node.isEnumDeclaration(type) ? name : `type ${name}`)
  }

  const blocks: string[] = []
  if (options.package && bindings.size > 0) {
    const sorted = [...bindings].sort((a, b) => a[0].localeCompare(b[0])).map(([, binding]) => binding)
    blocks.push(importLine(sorted, options.package, ctx.width))
  }
  blocks.push(...typeBlocks, ...symbols)
  return `${blocks.join("\n\n")}\n`
}

/* ------------------------------------------------------------- targets --- */

function findTargets(project: Project, names?: string[]): { targets: DocTarget[], exported: (name: string) => boolean } {
  const barrel = project.getSourceFiles().find((file) => /(^|\/)src\/index\.tsx?$/.test(file.getFilePath()))
  const exports = new Map<string, Node[]>()
  if (barrel) {
    for (const [name, decls] of barrel.getExportedDeclarations()) exports.set(name, decls)
  } else {
    for (const file of project.getSourceFiles()) {
      if (file.isInNodeModules() || file.isDeclarationFile()) continue
      for (const [name, decls] of file.getExportedDeclarations()) if (!exports.has(name)) exports.set(name, decls)
    }
  }

  const targets: DocTarget[] = []
  for (const name of names ?? exports.keys()) {
    const node = exports.get(name)?.find(isDocumentable)
    if (node) targets.push({ name, node })
  }
  return { targets, exported: (name) => exports.has(name) }
}

function declarationIn(project: Project, file: string, local: string): Node | undefined {
  const source = project.getSourceFile(file)
  if (!source) return undefined
  return source.getClass(local) ?? source.getFunction(local) ?? source.getInterface(local) ?? source.getTypeAlias(local) ?? source.getEnum(local)
}

function isDocumentable(node: Node): boolean {
  return Node.isClassDeclaration(node) || Node.isFunctionDeclaration(node)
    || Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node) || Node.isEnumDeclaration(node)
}

function renderDeclaration(name: string, node: Node, ctx: Ctx): string[] {
  if (Node.isClassDeclaration(node)) return [...docBlock(node, ctx, true), ...renderClass(name, node, ctx)]
  if (Node.isFunctionDeclaration(node)) return [...docBlock(node, ctx, true), ...renderFunction(name, node, ctx)]
  if (isTypeDeclaration(node)) return renderType(node, ctx, name)
  return []
}

/* ------------------------------------------------------------- classes --- */

function renderClass(name: string, cls: ClassDeclaration, ctx: Ctx): string[] {
  const parents = ancestors(cls)
  const inherited = new Set(parents.flatMap(memberNames))
  const heritage = [
    cls.getExtends() ? ` extends ${note(ctx, oneLine(cls.getExtends()!.getText()))}` : "",
    cls.getImplements().length > 0 ? ` implements ${cls.getImplements().map((node) => note(ctx, oneLine(node.getText()))).join(", ")}` : "",
  ].join("")
  const head = `${cls.isAbstract() ? "abstract " : ""}class ${name}${typeParams(cls, ctx)}${heritage}`

  const body: string[] = []
  const add = (node: Node, text: string) => body.push(...docBlock(node, ctx, false), ...text.split("\n"))

  const ctor = [cls, ...parents].map((owner) => owner.getConstructors()[0]).find(Boolean)
  if (ctor && (ctx.includePrivate || ctor.getScope() === "public")) {
    const overloads = ctor.getOverloads()
    if (overloads.length > 0) for (const overload of overloads) add(overload, signature("constructor", renderParams(overload, ctx), undefined, ctx))
    else add(ctor, signature("constructor", renderParams(ctor, ctx), undefined, ctx))
  }

  for (const member of cls.getMembers()) {
    const memberName = memberNameOf(member)
    if (!memberName || inherited.has(memberName)) continue
    if (!ctx.includePrivate && "getScope" in member && (member as { getScope(): string }).getScope() !== "public") continue

    if (Node.isPropertyDeclaration(member)) {
      if (member.isReadonly()) continue
      add(member, propertySignature(member, ctx))
    } else if (Node.isMethodDeclaration(member)) {
      const overloads = member.getOverloads()
      for (const method of overloads.length > 0 ? overloads : [member]) add(method, methodSignature(method, ctx))
    } else if (Node.isGetAccessorDeclaration(member)) {
      add(member, `${modifiers(member)}get ${memberName}(): ${note(ctx, returnText(member))}`)
    } else if (Node.isSetAccessorDeclaration(member) && !cls.getGetAccessor(memberName)) {
      add(member, `${modifiers(member)}set ${memberName}(${renderParams(member, ctx).join(", ")})`)
    }
  }

  if (body.length === 0) return [`${head} {}`]
  return [`${head} {`, ...body.map((line) => (line ? `  ${line}` : line)), "}"]
}

/** base classes, nearest first */
function ancestors(cls: ClassDeclaration): ClassDeclaration[] {
  const out: ClassDeclaration[] = []
  let current = cls.getBaseClass()
  while (current && !out.includes(current)) {
    out.push(current)
    current = current.getBaseClass()
  }
  return out
}

function memberNames(cls: ClassDeclaration): string[] {
  return cls.getMembers().map(memberNameOf).filter((name): name is string => !!name)
}

function memberNameOf(member: Node): string | undefined {
  if (!Node.isPropertyDeclaration(member) && !Node.isMethodDeclaration(member)
    && !Node.isGetAccessorDeclaration(member) && !Node.isSetAccessorDeclaration(member)) return undefined
  if (Node.isPrivateIdentifier(member.getNameNode())) return undefined
  return member.getName()
}

function modifiers(member: Node & { isStatic(): boolean, isAbstract(): boolean }): string {
  const scope = "getScope" in member ? (member as { getScope(): string }).getScope() : "public"
  return [scope !== "public" ? scope : "", member.isStatic() ? "static" : "", member.isAbstract() ? "abstract" : ""]
    .filter(Boolean)
    .map((word) => `${word} `)
    .join("")
}

function propertySignature(property: Node & { getName(): string }, ctx: Ctx): string {
  const node = property as import("ts-morph").PropertyDeclaration
  const type = node.getTypeNode()?.getText() ?? typeText(node.getType(), node)
  const init = node.getInitializer()
  const value = init ? inlineConsts(init) : undefined
  const shown = value && !value.includes("\n") && value.length <= MAX_INLINE_VALUE ? ` = ${value}` : ""
  return `${modifiers(node)}${node.getName()}${node.hasQuestionToken() ? "?" : ""}: ${note(ctx, oneLine(type))}${shown}`
}

function methodSignature(method: MethodDeclaration, ctx: Ctx): string {
  const prefix = `${modifiers(method)}${method.isAsync() ? "async " : ""}`
  return signature(`${prefix}${method.getName()}${typeParams(method, ctx)}`, renderParams(method, ctx), returnText(method), ctx)
}

/* ----------------------------------------------------------- functions --- */

function renderFunction(name: string, fn: FunctionDeclaration, ctx: Ctx): string[] {
  const overloads = fn.getOverloads()
  return (overloads.length > 0 ? overloads : [fn]).flatMap((node) => {
    const head = `${node.isAsync() ? "async function" : "function"}${node.isGenerator() ? "*" : ""} ${name}${typeParams(node, ctx)}`
    return signature(head, renderParams(node, ctx), returnText(node), ctx).split("\n")
  })
}

/* -------------------------------------------------------------- params --- */

/** one entry per rendered param. an options object destructured in the body becomes one param per key */
function renderParams(fn: { getParameters(): ParameterDeclaration[], getBody?(): Node | undefined }, ctx: Ctx): string[] {
  const body = fn.getBody?.()
  const out: string[] = []
  for (const param of fn.getParameters()) {
    const name = param.getNameNode()
    const pattern = Node.isObjectBindingPattern(name) ? name : Node.isIdentifier(name) ? destructuredInBody(body, name) : undefined
    if (pattern) out.push(...expandPattern(pattern, param, ctx))
    else out.push(paramSignature(param, ctx))
  }
  return out
}

/** finds `const { a = 1, ...rest } = <name>` among the body's top level statements */
function destructuredInBody(body: Node | undefined, name: Identifier): ObjectBindingPattern | undefined {
  if (!body || !Node.isBlock(body)) return undefined
  for (const statement of body.getStatements()) {
    if (!Node.isVariableStatement(statement)) continue
    for (const declaration of statement.getDeclarations()) {
      const target = declaration.getNameNode()
      const init = declaration.getInitializer()
      if (Node.isObjectBindingPattern(target) && init && Node.isIdentifier(init) && init.getText() === name.getText()) return target
    }
  }
  return undefined
}

function expandPattern(pattern: ObjectBindingPattern, param: ParameterDeclaration, ctx: Ctx): string[] {
  const type = param.getType()
  const used = new Set<string>()
  const out: string[] = []
  let rest: string | undefined

  for (const element of pattern.getElements()) {
    const local = element.getNameNode().getText()
    if (element.getDotDotDotToken()) {
      rest = `...${local}: ${note(ctx, restType(type, used, param))}`
      continue
    }
    const key = element.getPropertyNameNode()?.getText() ?? local
    used.add(key)
    const property = type.getProperty(key)
    const initializer = element.getInitializer()
    const optional = !!property && property.hasFlags(ts.SymbolFlags.Optional)
    const known = property ? typeText(property.getTypeAtLocation(param), param) : typeText(element.getType(), element)
    const shown = optional || initializer ? stripUndefined(known) : known
    const value = initializer ? ` = ${inlineConsts(initializer)}` : ""
    out.push(`${key}${optional && !initializer ? "?" : ""}: ${note(ctx, shown)}${value}`)
  }
  if (rest) out.push(rest)
  return out
}

/** what is left of an options type once the destructured keys are taken out */
function restType(type: Type, used: Set<string>, at: Node): string {
  const parts = type.isIntersection() ? type.getIntersectionTypes() : [type]
  const kept: string[] = []
  for (const part of parts) {
    const props = part.getProperties()
    const taken = props.filter((prop) => used.has(prop.getName()))
    if (taken.length === 0) {
      kept.push(typeText(part, at))
    } else if (taken.length < props.length) {
      const anonymous = part.isObject() && !part.getAliasSymbol() && part.getSymbol()?.getName() === "__type"
      kept.push(anonymous
        ? `{ ${props.filter((prop) => !used.has(prop.getName())).map((prop) => memberText(prop, at)).join("; ")} }`
        : `Omit<${typeText(part, at)}, ${taken.map((prop) => JSON.stringify(prop.getName())).join(" | ")}>`)
    }
  }
  return kept.length > 0 ? kept.join(" & ") : "{}"
}

function memberText(prop: import("ts-morph").Symbol, at: Node): string {
  const optional = prop.hasFlags(ts.SymbolFlags.Optional)
  const type = typeText(prop.getTypeAtLocation(at), at)
  return `${prop.getName()}${optional ? "?" : ""}: ${optional ? stripUndefined(type) : type}`
}

function paramSignature(param: ParameterDeclaration, ctx: Ctx): string {
  const init = param.getInitializer()
  const declared = param.getTypeNode()?.getText()
  const type = declared ? oneLine(declared) : typeText(param.getType(), param)
  const scope = param.getScope()
  const prefix = [param.hasScopeKeyword() && scope !== "public" ? scope : "", param.isReadonly() ? "readonly" : ""]
    .filter(Boolean)
    .map((word) => `${word} `)
    .join("")
  const head = `${prefix}${param.isRestParameter() ? "..." : ""}${param.getNameNode().getText()}${param.hasQuestionToken() && !init ? "?" : ""}`
  const shown = init && !declared ? stripUndefined(type) : type
  return `${head}: ${note(ctx, shown)}${init ? ` = ${inlineConsts(init)}` : ""}`
}

/** params stay on one line unless there are several and the line runs past the width */
function signature(head: string, params: string[], returns: string | undefined, ctx: Ctx): string {
  const close = returns === undefined ? ")" : `): ${note(ctx, returns)}`
  const inline = `${head}(${params.join(", ")}${close}`
  if (params.length < 2 || inline.split("\n")[0]!.length <= ctx.width) return inline
  return [`${head}(`, ...params.map((param) => `  ${param.replace(/\n/g, "\n  ")},`), close].join("\n")
}

function returnText(fn: { getReturnTypeNode(): Node | undefined, getReturnType(): Type }): string {
  const declared = fn.getReturnTypeNode()
  return declared ? oneLine(declared.getText()) : typeText(fn.getReturnType(), fn as Node)
}

function typeParams(node: Node & { getTypeParameters(): { getText(): string }[] }, ctx: Ctx): string {
  const list = node.getTypeParameters().map((param) => note(ctx, oneLine(param.getText())))
  return list.length === 0 ? "" : `<${list.join(", ")}>`
}

/* ---------------------------------------------------- inlining consts ---- */

/** replaces identifiers that are `const` literals with the literal. `WIDTH * 2` -> `48 * 2` */
function inlineConsts(expr: Node): string {
  const start = expr.getStart()
  const ids = [...(Node.isIdentifier(expr) ? [expr] : []), ...expr.getDescendantsOfKind(SyntaxKind.Identifier)]
  let text = expr.getText()
  for (const id of ids.sort((a, b) => b.getStart() - a.getStart())) {
    if (isNameOnly(id)) continue
    const literal = constLiteral(id, 0)
    if (literal === undefined) continue
    text = text.slice(0, id.getStart() - start) + literal + text.slice(id.getEnd() - start)
  }
  return oneLine(text)
}

function isNameOnly(id: Identifier): boolean {
  const parent = id.getParent()
  if (Node.isPropertyAccessExpression(parent)) return parent.getNameNode() === id
  if (Node.isPropertyAssignment(parent)) return parent.getNameNode() === id
  if (Node.isBindingElement(parent)) return parent.getNameNode() === id || parent.getPropertyNameNode() === id
  if (Node.isParameterDeclaration(parent)) return parent.getNameNode() === id
  return Node.isShorthandPropertyAssignment(parent)
}

function constLiteral(id: Identifier, depth: number): string | undefined {
  if (depth > 5) return undefined
  let symbol = id.getSymbol()
  if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol() ?? symbol
  const declaration = symbol?.getValueDeclaration()
  if (!declaration || !Node.isVariableDeclaration(declaration)) return undefined
  if (declaration.getVariableStatement()?.getDeclarationKind() !== VariableDeclarationKind.Const) return undefined
  const init = declaration.getInitializer()
  return init ? literalText(init, depth) : undefined
}

function literalText(node: Node, depth: number): string | undefined {
  if (Node.isAsExpression(node) || Node.isParenthesizedExpression(node) || Node.isSatisfiesExpression(node)) {
    return literalText(node.getExpression(), depth)
  }
  if (Node.isNumericLiteral(node) || Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)
    || Node.isTrueLiteral(node) || Node.isFalseLiteral(node) || Node.isNullLiteral(node)) return node.getText()
  if (Node.isPrefixUnaryExpression(node) && Node.isNumericLiteral(node.getOperand())) return node.getText()
  if (Node.isIdentifier(node)) return constLiteral(node, depth + 1)
  if (Node.isArrayLiteralExpression(node)) {
    const items = node.getElements().map((element) => literalText(element, depth))
    if (items.some((item) => item === undefined)) return undefined
    const text = `[${items.join(", ")}]`
    return text.length <= MAX_INLINE_VALUE ? text : undefined
  }
  return undefined
}

/* --------------------------------------------------------------- types --- */

type TypeDeclaration = import("ts-morph").InterfaceDeclaration | import("ts-morph").TypeAliasDeclaration | import("ts-morph").EnumDeclaration

function isTypeDeclaration(node: Node): node is TypeDeclaration {
  return Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node) || Node.isEnumDeclaration(node)
}

/**
 * interfaces, aliases and enums the rendered signatures mention, and the ones those mention in turn.
 * names declared more than once in the project are ambiguous and left out.
 */
function referencedTypes(project: Project, ctx: Ctx, requested: Set<string>): TypeDeclaration[] {
  const declared = new Map<string, TypeDeclaration[]>()
  for (const file of project.getSourceFiles()) {
    if (file.isInNodeModules() || file.isDeclarationFile()) continue
    for (const node of [...file.getInterfaces(), ...file.getTypeAliases(), ...file.getEnums()]) {
      const bucket = declared.get(node.getName())
      if (bucket) bucket.push(node)
      else declared.set(node.getName(), [node])
    }
  }

  const found = new Map<string, TypeDeclaration>()
  const queue = [...ctx.refs]
  while (queue.length > 0) {
    for (const word of queue.pop()!.match(/[A-Za-z_$][\w$]*/g) ?? []) {
      const nodes = declared.get(word)
      if (!nodes || nodes.length !== 1 || found.has(word) || requested.has(word)) continue
      found.set(word, nodes[0]!)
      queue.push(nodes[0]!.getText())
    }
  }
  return [...found.values()].sort((a, b) => {
    const files = a.getSourceFile().getFilePath().localeCompare(b.getSourceFile().getFilePath())
    return files || a.getStartLineNumber() - b.getStartLineNumber()
  })
}

function renderType(node: TypeDeclaration, ctx: Ctx, name?: string): string[] {
  let text = node.getText().replace(/^export\s+(default\s+)?/, "")
  if (name && name !== node.getName()) text = text.replace(node.getName(), name)
  return [...docBlock(node, ctx, true), ...text.split("\n")]
}

function typeText(type: Type, at: Node): string {
  const flags = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
  return oneLine(type.getText(at, flags)).replace(/import\("[^"]*"\)\./g, "")
}

function stripUndefined(text: string): string {
  return text.replace(/^undefined \| /, "").replace(/ \| undefined(?= \|)/, "").replace(/ \| undefined$/, "")
}

/* ---------------------------------------------------------------- text --- */

function note(ctx: Ctx, text: string): string {
  ctx.refs.push(text)
  return text
}

function docBlock(node: Node, ctx: Ctx, force: boolean): string[] {
  if (!force && !ctx.includeMemberDocs) return []
  if (!Node.isJSDocable(node)) return []
  const text = node.getJsDocs().map((doc) => doc.getDescription().trim()).filter(Boolean).join("\n\n")
  if (!text) return []
  const lines = text.split("\n").map((line) => line.trimEnd())
  if (lines.length === 1) return [`/** ${lines[0]} */`]
  return ["/**", ...lines.map((line) => (line ? ` * ${line}` : " *")), " */"]
}

function importLine(bindings: string[], source: string, width: number): string {
  const line = `import { ${bindings.join(", ")} } from "${source}"`
  if (line.length <= width) return line
  return ["import {", ...bindings.map((binding) => `  ${binding},`), `} from "${source}"`].join("\n")
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/** name of the nearest package.json above `file`, when there is one */
function packageName(file: string): string | null {
  let dir = dirname(file)
  while (true) {
    try {
      const name = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).name
      if (typeof name === "string") return name
    } catch {}
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}
