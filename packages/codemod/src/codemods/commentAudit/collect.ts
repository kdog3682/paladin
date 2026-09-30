import { createHash } from "node:crypto"
import { dirname, isAbsolute } from "node:path"
import { Node, SyntaxKind, ts, type Project } from "ts-morph"
import { getDocComment } from "../../utils/comments"
import { getPublicSurface, isInSignature } from "../../utils/getPublicSurface"
import { applyTextEdits } from "../../utils/textEdits"

export type CollectOptions = {
  /* entry file whose exports make up the public api, relative to the package root; `src/index.ts` by default */
  entry?: string
  /* a declaration comment longer than this many characters is flagged for a rewrite; 240 by default */
  longThreshold?: number
}

/* missing: no comment; long: a declaration comment over the threshold; ok: nothing to do */
export type AuditStatus = "missing" | "long" | "ok"

export type AuditEntry = {
  /* `<file>#<Name>` for a declaration, `<file>#<Name>.<member path>` for a member */
  id: string
  /* the declaration or member the comment belongs to */
  node: Node
  /* the comment above it, without comment markers */
  comment?: string
  status: AuditStatus
  /* hash of the signature without comments and bodies, to spot code that changed since the request */
  hash: string
  /* documentable members: fields, methods, enum members and the fields of inline object types */
  members: AuditEntry[]
}

/*
 * Collects every declaration of the public api and its members, with their comments and
 * status, ordered by file and position. Members never get the `long` status.
 */
export function collectEntries(project: Project, opts: CollectOptions = {}): AuditEntry[] {
  const { entry = "src/index.ts", longThreshold = 240 } = opts
  const surface = getPublicSurface(project, entry)
  const root = getRoot(surface.entry.getFilePath(), entry)
  const declarations = [...new Set(surface.declarations.flatMap(expandOverloads))].sort(byLocation)
  const counts = new Map<string, number>()
  const uniqueId = (base: string) => {
    const count = (counts.get(base) ?? 0) + 1
    counts.set(base, count)
    return count === 1 ? base : `${base}~${count}`
  }

  return declarations.map((declaration): AuditEntry => {
    const file = relativeTo(root, declaration.getSourceFile().getFilePath())
    const id = uniqueId(`${file}#${nameOf(declaration, "default")}`)
    const comment = getDocComment(declaration)
    const members = getMembers(declaration).map((member): AuditEntry => {
      const memberComment = getDocComment(member)
      return {
        id: uniqueId(`${id}.${getMemberPath(member, declaration)}`),
        node: member,
        comment: memberComment,
        status: memberComment ? "ok" : "missing",
        hash: hashSignature(member),
        members: [],
      }
    })
    return {
      id,
      node: declaration,
      comment,
      status: !comment ? "missing" : comment.length > longThreshold ? "long" : "ok",
      hash: hashSignature(declaration),
      members,
    }
  })
}

/* The outermost function bodies inside a node: blocks, and the expression bodies of arrow functions. */
export function getBodies(node: Node): Node[] {
  const bodies: Node[] = []
  node.forEachDescendant((child, traversal) => {
    const parent = child.getParent()
    if (parent && Node.isFunctionLikeDeclaration(parent) && parent.getBody() === child) {
      bodies.push(child)
      traversal.skip()
    }
  })
  return bodies
}

/* the package root with a trailing slash, eg `/home/me/pkg/`, or `/` for an in-memory project */
function getRoot(entryPath: string, entry: string): string {
  const suffix = `/${entry.replace(/^\.?\//, "")}`
  const root = !isAbsolute(entry) && entryPath.endsWith(suffix)
    ? entryPath.slice(0, -suffix.length)
    : dirname(entryPath)
  return root.endsWith("/") ? root : `${root}/`
}

/* a path relative to the root; not path.relative, which resolves against the working directory */
function relativeTo(root: string, path: string): string {
  return path.startsWith(root) ? path.slice(root.length) : path
}

function getMembers(declaration: Node): Node[] {
  const members: Node[] = []
  if (Node.isInterfaceDeclaration(declaration)) members.push(...declaration.getMembers())
  if (Node.isClassDeclaration(declaration)) members.push(...declaration.getConstructors(), ...declaration.getMembers())
  if (Node.isEnumDeclaration(declaration)) members.push(...declaration.getMembers())
  for (const literal of declaration.getDescendantsOfKind(SyntaxKind.TypeLiteral)) {
    if (isInSignature(literal, declaration)) members.push(...literal.getMembers())
  }
  return [...new Set(members.flatMap(expandOverloads))]
    .filter(member => isDocumentable(member) && isInSignature(member, declaration))
    .sort(byLocation)
}

function isDocumentable(node: Node): boolean {
  return Node.isPropertySignature(node)
    || Node.isMethodSignature(node)
    || Node.isPropertyDeclaration(node)
    || Node.isMethodDeclaration(node)
    || Node.isGetAccessorDeclaration(node)
    || Node.isSetAccessorDeclaration(node)
    || Node.isConstructorDeclaration(node)
    || Node.isEnumMember(node)
}

function getMemberPath(member: Node, declaration: Node): string {
  const names: string[] = []
  for (let node: Node | undefined = member; node && node !== declaration; node = node.getParent()) {
    if (isDocumentable(node) || Node.isParameterDeclaration(node)) names.unshift(nameOf(node, "constructor"))
  }
  return names.join(".")
}

/* overloaded functions and methods are documented per overload, the implementation isn't public */
function expandOverloads(node: Node): Node[] {
  if (!Node.isFunctionDeclaration(node) && !Node.isMethodDeclaration(node)) return [node]
  const implementation = node.isOverload() ? node.getImplementation() : node
  const overloads: Node[] = implementation?.getOverloads() ?? []
  return overloads.length ? overloads : [node]
}

function nameOf(node: Node, fallback: string): string {
  return (node as { getName?(): string | undefined }).getName?.() ?? fallback
}

function byLocation(a: Node, b: Node): number {
  return a.getSourceFile().getFilePath().localeCompare(b.getSourceFile().getFilePath()) || a.getStart() - b.getStart()
}

function hashSignature(node: Node): string {
  const edits = getBodies(node).map(body => ({ start: body.getStart(), end: body.getEnd(), text: "{}" }))
  const text = applyTextEdits(node.getText(), edits, node.getStart())
  return createHash("sha1").update(normalizeTokens(text)).digest("hex").slice(0, 8)
}

/* the tokens of a text joined by single spaces, so comments and formatting don't change the hash */
function normalizeTokens(text: string): string {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text)
  const tokens: string[] = []
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) tokens.push(scanner.getTokenText())
  return tokens.join(" ")
}
