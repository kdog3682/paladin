import { Node, ts } from "ts-morph"
import type { Project, Signature, SourceFile, Symbol as MorphSymbol, Type } from "ts-morph"
import { isExported } from "../utils/declarations"

type GatherSpec = {
  /** substrings of a file path that mark it as a consumer whose imports are read */
  markers?: string[]
  /** the type a signature must take or return (or carry, or inherit from) to be counted in */
  base?: string
}

type PublicExport = {
  /** the name the declaring file exports it under (the local import name for a default export) */
  name: string
  /** whether the declaring file exports it as its default */
  isDefault: boolean
  /** the file that declares it */
  file: string
  /** class and function exports are values, type exports are interfaces or type aliases */
  kind: "class" | "function" | "type"
  /** the first qualifying signature, for symbols imported by a consumer */
  signature?: string
  /** the consumer files that import it directly */
  usedIn: string[]
  /** the exports whose signature led to it, for symbols no consumer imports directly */
  via: string[]
}

type ImportedName = {
  /** the name the symbol is imported by */
  name: string
  /** the node whose symbol leads to the declaration */
  node: Node
}

const FORMAT = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope

/**
 * Reads the imports of every demo and example file and keeps the imported symbols with a
 * call or construct signature that takes or returns the base type (Mobject by default):
 * the type itself, anything inheriting from it, or anything carrying one in a union or as
 * a type argument (`Node<Frame>`, `Frame[]`, `Tree<VMobject>`). Also kept, so the barrel is
 * complete:
 * - every base-derived class reached through those signatures, with its ancestors up to
 *   the base (`stack(): Node<Frame>` brings in `Frame`, `VGroup`, `VMobject`, `Mobject`)
 * - every exported, non-generic type alias or interface those signatures are written in
 *   terms of that carries the base type (`serializeScene(scene: Scene)` brings in `Scene`)
 * Re-exports and aliases are followed to the declaring file; anything unexported or
 * declared in node_modules is skipped.
 */
export function gatherPublicExports(project: Project, spec: GatherSpec = {}): PublicExport[] {
  const { markers = [".demo.", ".examples."], base = "Mobject" } = spec
  const entries = new Map<ts.Symbol, PublicExport>()
  const checked = new Set<ts.Symbol>()

  const reach = (symbol: MorphSymbol, via: string) => {
    const decl = symbol.getDeclarations().find(
      (d) => Node.isClassDeclaration(d) || Node.isInterfaceDeclaration(d) || Node.isTypeAliasDeclaration(d),
    )
    if (!decl || decl.getSourceFile().isInNodeModules() || !isExported(decl)) return

    const existing = entries.get(symbol.compilerSymbol)
    if (existing) {
      if (existing.name !== via && !existing.via.includes(via)) existing.via.push(via)
      return
    }
    const isClass = Node.isClassDeclaration(decl)
    entries.set(symbol.compilerSymbol, {
      name: (isClass ? decl.getName() : symbol.getName()) ?? "default",
      isDefault: isClass && decl.isDefaultExport(),
      file: decl.getSourceFile().getFilePath(),
      kind: isClass ? "class" : "type",
      usedIn: [],
      via: [via],
    })
  }

  for (const file of project.getSourceFiles()) {
    const path = file.getFilePath()
    if (path.includes("/node_modules/") || !markers.some((m) => path.includes(m))) continue

    for (const { name, node } of getImportedNames(file)) {
      const symbol = resolve(node)
      if (!symbol) continue
      const key = symbol.compilerSymbol

      if (!checked.has(key)) {
        checked.add(key)
        const hit = describe(symbol, name, base)
        if (hit) {
          const { reached, ...entry } = hit
          // an export first reached through another keeps its via list
          entries.set(key, { ...entry, usedIn: [], via: entries.get(key)?.via ?? [] })
          for (const s of reached) reach(s, entry.name)
        }
      }

      const entry = entries.get(key)
      if (entry?.signature !== undefined && !entry.usedIn.includes(path)) entry.usedIn.push(path)
    }
  }

  return [...entries.values()].sort(
    (a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name),
  )
}

/** named, default and `ns.Name` imports of a file; type-only imports are skipped */
function getImportedNames(file: SourceFile): ImportedName[] {
  const names: ImportedName[] = []

  for (const decl of file.getImportDeclarations()) {
    if (decl.isTypeOnly()) continue

    const defaultImport = decl.getDefaultImport()
    if (defaultImport) names.push({ name: defaultImport.getText(), node: defaultImport })

    for (const specifier of decl.getNamedImports()) {
      if (specifier.isTypeOnly()) continue
      names.push({
        name: specifier.getName(),
        node: specifier.getAliasNode() ?? specifier.getNameNode(),
      })
    }

    const namespace = decl.getNamespaceImport()
    if (!namespace) continue
    const nsName = namespace.getText()
    for (const access of file.getDescendantsOfKind(ts.SyntaxKind.PropertyAccessExpression)) {
      const target = access.getExpression()
      if (!Node.isIdentifier(target) || target.getText() !== nsName) continue
      names.push({ name: access.getName(), node: access.getNameNode() })
    }
  }
  return names
}

/** follows import aliases and re-export chains to the symbol that is actually declared */
function resolve(node: Node): MorphSymbol | undefined {
  const symbol = node.getSymbol()
  if (!symbol) return undefined
  return symbol.isAlias() ? (symbol.getAliasedSymbol() ?? symbol) : symbol
}

function describe(symbol: MorphSymbol, localName: string, base: string) {
  const decl = symbol.getValueDeclaration() ?? symbol.getDeclarations()[0]
  if (!decl) return null
  const file = decl.getSourceFile()
  if (file.isInNodeModules()) return null

  const declaredName = symbol.getName()
  const isDefault = declaredName === "default"
  const type = symbol.getTypeAtLocation(decl)
  const candidates = [
    { kind: "class" as const, signatures: type.getConstructSignatures() },
    { kind: "function" as const, signatures: type.getCallSignatures() },
  ]

  for (const { kind, signatures } of candidates) {
    for (const signature of signatures) {
      const returnType = signature.getReturnType()
      const params = signature.getParameters().map((p) => ({
        name: p.getName(),
        type: p.getTypeAtLocation(decl),
      }))

      const derived = collectDerived([returnType, ...params.map((p) => p.type)], base)
      if (derived.length === 0) continue

      const paramText = params.map((p) => `${p.name}: ${p.type.getText(decl, FORMAT)}`).join(", ")
      const classes = derived.flatMap((t) => getAncestry(t, base))
      const reached = [
        ...classes.map((t) => t.getSymbol()).filter((s): s is MorphSymbol => s !== undefined),
        ...getReferencedTypes(signature, base),
      ]

      return {
        name: isDefault ? localName : declaredName,
        isDefault,
        file: file.getFilePath(),
        kind,
        signature: `(${paramText}) => ${returnType.getText(decl, FORMAT)}`,
        reached,
      }
    }
  }
  return null
}

/**
 * The base-derived types a set of types are or carry: themselves, the members of unions
 * and intersections, and type arguments at any nesting, which also walks recursive aliases
 * like `Tree<T> = T | Tree<T>[]` down to `T`.
 */
function collectDerived(roots: Type[], base: string): Type[] {
  const seen = new Set<ts.Type>()
  const found: Type[] = []

  const visit = (type: Type) => {
    if (seen.has(type.compilerType)) return
    seen.add(type.compilerType)

    if (type.isUnion() || type.isIntersection()) {
      const members = type.isUnion() ? type.getUnionTypes() : type.getIntersectionTypes()
      members.forEach(visit)
      return
    }
    if (derivesFrom(type, base)) found.push(type)
    for (const arg of [...type.getTypeArguments(), ...type.getAliasTypeArguments()]) visit(arg)
  }

  roots.forEach(visit)
  return found
}

/**
 * The type aliases and interfaces a signature's parameter and return annotations refer to
 * by name, kept when they are non-generic and carry the base type. Generic helpers like
 * `Tree<T>` don't carry it on their own and fall out; `Scene = Tree<VMobject>` stays.
 */
function getReferencedTypes(signature: Signature, base: string): MorphSymbol[] {
  let decl: Node | undefined
  try {
    decl = signature.getDeclaration()
  } catch {
    // implicit constructors have no declaration
    return []
  }
  if (!decl) return []

  const typeNodes = [
    ...(Node.isParametered(decl) ? decl.getParameters().map((p) => p.getTypeNode()) : []),
    Node.isReturnTyped(decl) ? decl.getReturnTypeNode() : undefined,
  ].filter((n): n is Node => n !== undefined)

  const refs = typeNodes.flatMap((n) => [
    ...(Node.isTypeReference(n) ? [n] : []),
    ...n.getDescendantsOfKind(ts.SyntaxKind.TypeReference),
  ])

  const symbols: MorphSymbol[] = []
  for (const ref of refs) {
    const symbol = resolve(ref.getTypeName())
    const target = symbol?.getDeclarations().find(
      (d) => Node.isTypeAliasDeclaration(d) || Node.isInterfaceDeclaration(d),
    )
    if (!symbol || !target || target.getSourceFile().isInNodeModules()) continue
    if (target.getTypeParameters().length > 0) continue
    if (collectDerived([target.getType()], base).length === 0) continue
    symbols.push(symbol)
  }
  return symbols
}

/**
 * How close a declaration's call or construct signatures come to the base type: the
 * fewest inheritance steps from any base-derived type its parameters or return carry
 * (`Mobject` is 0, `VMobject` is 1). Infinity when none carry it, which includes anything
 * that isn't callable. Used to choose between declarations that share a name.
 */
export function getBaseDistance(node: Node, base = "Mobject"): number {
  const symbol = node.getSymbol()
  if (!symbol) return Infinity
  const type = symbol.getTypeAtLocation(node)

  const types = [...type.getCallSignatures(), ...type.getConstructSignatures()].flatMap((s) => [
    s.getReturnType(),
    ...s.getParameters().map((p) => p.getTypeAtLocation(node)),
  ])
  return Math.min(Infinity, ...collectDerived(types, base).map((t) => stepsTo(t, base)))
}

/** inheritance steps from a base-derived type up to the base */
function stepsTo(type: Type, base: string, seen = new Set<ts.Type>()): number {
  if (type.isTypeParameter()) {
    const constraint = type.getConstraint()
    return constraint ? stepsTo(constraint, base, seen) : Infinity
  }
  const target = type.getTargetType() ?? type
  if (seen.has(target.compilerType)) return Infinity
  seen.add(target.compilerType)

  if (target.getSymbol()?.getName() === base) return 0
  return 1 + Math.min(Infinity, ...target.getBaseTypes().map((t) => stepsTo(t, base, seen)))
}

/** a base-derived type followed by each ancestor up to the base; type parameters go through their constraint */
function getAncestry(type: Type, base: string, seen = new Set<ts.Type>()): Type[] {
  if (type.isTypeParameter()) {
    const constraint = type.getConstraint()
    return constraint ? getAncestry(constraint, base, seen) : []
  }
  const target = type.getTargetType() ?? type
  if (seen.has(target.compilerType) || !derivesFrom(target, base)) return []
  seen.add(target.compilerType)

  return [target, ...target.getBaseTypes().flatMap((t) => getAncestry(t, base, seen))]
}

/**
 * Whether a type is, or inherits from, a class or interface of a given name, through a
 * chain of any length (`A extends B extends C extends Mobject`). Also follows generic
 * instantiations (`Group<Circle>` through `Group`), type parameter constraints
 * (`T extends Mobject`, polymorphic `this`) and mixin bases. A union qualifies when every
 * member other than null and undefined does, an intersection when any member does.
 */
function derivesFrom(type: Type, name: string, memo = new Map<ts.Type, boolean>()): boolean {
  const known = memo.get(type.compilerType)
  if (known !== undefined) return known
  // cycle guard: a type that reaches itself does not derive through that path
  memo.set(type.compilerType, false)

  const result = (() => {
    if (type.isUnion()) {
      const members = type.getUnionTypes().filter((t) => !t.isNull() && !t.isUndefined())
      return members.length > 0 && members.every((t) => derivesFrom(t, name, memo))
    }
    if (type.isIntersection()) {
      return type.getIntersectionTypes().some((t) => derivesFrom(t, name, memo))
    }
    if (type.isTypeParameter()) {
      const constraint = type.getConstraint()
      return constraint ? derivesFrom(constraint, name, memo) : false
    }
    if (type.getSymbol()?.getName() === name) return true

    const target = type.getTargetType()
    if (target && target.compilerType !== type.compilerType && derivesFrom(target, name, memo)) {
      return true
    }
    // each base recurses into its own bases, so the chain is walked to any depth
    return type.getBaseTypes().some((t) => derivesFrom(t, name, memo))
  })()

  memo.set(type.compilerType, result)
  return result
}
