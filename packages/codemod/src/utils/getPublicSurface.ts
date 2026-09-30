import { Node, SyntaxKind, type Project, type SourceFile, type Type } from "ts-morph"

/* the public api of a package */
export type PublicSurface = {
  /* the entry file the surface was read from */
  entry: SourceFile
  /* the exported declarations first, then every declaration their signatures pull in, in discovery order */
  declarations: Node[]
}

/*
 * Collects the public api of a package: the declarations exported from an entry file, plus the
 * project-local declarations their signatures reference, recursively, whether exported or not.
 * Function bodies, initializers and private class members aren't signature, so what they
 * reference isn't pulled in. When a return or variable type is inferred rather than written, the
 * declarations behind the inferred type are followed instead. Only module-scope declarations are
 * returned; anything from node_modules or a .d.ts file is left out. A string entry is matched
 * against the end of each file path, so `src/index.ts` finds the package's own index.
 */
export function getPublicSurface(
  project: Project,
  entry: string | SourceFile = "src/index.ts",
): PublicSurface {
  const file = typeof entry === "string" ? findEntry(project, entry) : entry
  const seen = new Set<Node>()
  const declarations: Node[] = []
  const visit = (node: Node) => {
    if (seen.has(node) || !isModuleScope(node) || !isProjectLocal(node)) return
    seen.add(node)
    declarations.push(node)
  }
  for (const nodes of file.getExportedDeclarations().values()) nodes.forEach(visit)
  for (let i = 0; i < declarations.length; i++) getReferencedDeclarations(declarations[i]!).forEach(visit)
  return { entry: file, declarations }
}

/*
 * Tells whether a node inside a declaration is part of its signature, ie not inside a function
 * body, an initializer or a non-public class member. A function or arrow assigned to a variable
 * declaration counts as that declaration's signature, apart from its body.
 */
export function isInSignature(node: Node, declaration: Node): boolean {
  let child = node
  while (child !== declaration) {
    const parent = child.getParent()
    if (!parent || Node.isBlock(child)) return false
    if (Node.isArrowFunction(parent) && parent.getBody() === child) return false
    if (
      Node.isInitializerExpressionGetable(parent)
      && parent.getInitializer() === child
      && !(parent === declaration && isFunctionExpression(child))
    ) return false
    if ((Node.isClassDeclaration(parent) || Node.isClassExpression(parent)) && !isPublicMember(child)) return false
    child = parent
  }
  return true
}

/* Tells whether a class member can be reached from outside the class: not `private` and not a `#name`. */
export function isPublicMember(member: Node): boolean {
  if (Node.isModifierable(member) && member.hasModifier(SyntaxKind.PrivateKeyword)) return false
  const name = (member as { getNameNode?(): Node | undefined }).getNameNode?.()
  return !(name && Node.isPrivateIdentifier(name))
}

function findEntry(project: Project, entry: string): SourceFile {
  const suffix = `/${entry.replace(/^\.?\//, "")}`
  const [file] = project
    .getSourceFiles()
    .filter(file => file.getFilePath().endsWith(suffix))
    .sort((a, b) => a.getFilePath().length - b.getFilePath().length)
  if (!file) throw new Error(`getPublicSurface: no source file matches ${entry}`)
  return file
}

function getReferencedDeclarations(declaration: Node): Node[] {
  const found: Node[] = []
  const visit = (node: Node) => {
    const name = getReferencedName(node)
    if (name) found.push(...resolve(name))
    const inferred = getInferredType(node)
    if (inferred) found.push(...getTypeDeclarations(inferred))
  }
  visit(declaration)
  declaration.forEachDescendant((node, traversal) => {
    if (!isInSignature(node, declaration)) {
      traversal.skip()
      return
    }
    visit(node)
  })
  return found
}

function getReferencedName(node: Node): Node | undefined {
  const name = Node.isTypeReference(node) ? node.getTypeName()
    : Node.isExpressionWithTypeArguments(node) ? node.getExpression()
    : Node.isTypeQuery(node) ? node.getExprName()
    : undefined
  if (!name) return
  if (Node.isQualifiedName(name)) return name.getRight()
  if (Node.isPropertyAccessExpression(name)) return name.getNameNode()
  return name
}

function resolve(name: Node): Node[] {
  const symbol = name.getSymbol()
  const target = symbol?.isAlias() ? symbol.getAliasedSymbol() : symbol
  return target?.getDeclarations() ?? []
}

function getInferredType(node: Node): Type | undefined {
  if (Node.isVariableDeclaration(node) || Node.isPropertyDeclaration(node) || Node.isParameterDeclaration(node)) {
    const initializer = node.getInitializer()
    if (node.getTypeNode() || (initializer && isFunctionExpression(initializer))) return
    return node.getType()
  }
  if (Node.isReturnTyped(node) && !Node.isConstructorDeclaration(node) && !Node.isSetAccessorDeclaration(node)) {
    return node.getReturnTypeNode() ? undefined : node.getReturnType()
  }
}

function getTypeDeclarations(type: Type, depth = 0): Node[] {
  if (depth > 4) return []
  const symbols = [type.getAliasSymbol(), type.getSymbol()]
  const nested = [
    ...type.getAliasTypeArguments(),
    ...type.getTypeArguments(),
    ...(type.isUnion() ? type.getUnionTypes() : []),
    ...(type.isIntersection() ? type.getIntersectionTypes() : []),
  ]
  return [
    ...symbols.flatMap(symbol => symbol?.getDeclarations() ?? []),
    ...nested.flatMap(inner => getTypeDeclarations(inner, depth + 1)),
  ]
}

function isFunctionExpression(node: Node): boolean {
  return Node.isArrowFunction(node) || Node.isFunctionExpression(node)
}

function isModuleScope(node: Node): boolean {
  const holder = Node.isVariableDeclaration(node) ? node.getVariableStatement() : node
  const parent = holder?.getParent()
  return !!parent && Node.isSourceFile(parent)
}

function isProjectLocal(node: Node): boolean {
  const file = node.getSourceFile()
  return !file.isInNodeModules() && !file.isDeclarationFile()
}
