import { Node, SyntaxKind, VariableDeclarationKind } from "ts-morph"
import type {
  ConditionalExpression,
  Expression,
  Project,
  PropertyAccessExpression,
  SourceFile,
  Type,
  VariableDeclaration,
  VariableStatement,
} from "ts-morph"

const MAX_INLINE_ELEMENTS = 3
const MAX_LINE_LENGTH = 100
const DESTRUCTURABLE_KINDS = new Set<VariableDeclarationKind>([
  VariableDeclarationKind.Const,
  VariableDeclarationKind.Let,
  VariableDeclarationKind.Var,
])

/*
Rewrites a property read with a fallback into a destructuring default, and merges
runs of adjacent statements reading the same object into a single pattern:

  const size = opts.size ?? 12                         const {
  const gap = opts.gap !== undefined ? opts.gap : 4  →    size = 12,
  const style = opts.style || {}                          gap = 4,
                                                          style = {},
                                                        } = opts

## Why some of these are left alone

Everything below follows from one fact: a destructuring default fires on undefined
and on nothing else. The forms it replaces are not all that narrow.

  form                           falls back on
  ---------------------------    ------------------------------------
  a.b !== undefined ? a.b : f    undefined                              exact match
  a.b === undefined ? f : a.b    undefined                              exact match
  a.b ?? f                       undefined, null
  a.b != null ? a.b : f          undefined, null
  a.b || f                       undefined, null, 0, '', NaN, false, 0n
  a.b ? a.b : f                  (as above)

The two exact forms are converted unconditionally. The rest are converted only when
the type says the extra values cannot occur, which is the job of the two gates:

  mayBeNull    for `??` and `!= null`. Is null in the type? any, unknown and a bare
               type parameter count as null, since nothing rules it out.
  mayBeFalsy   for `||` and `a.b ? a.b : f`. Built as an allow-list of types that are
               never falsy, so an unrecognised type errs toward leaving code alone.

So `opts.style || {}` converts (an object is always truthy) while `opts.size || 12`
does not (`0` would start taking the fallback), and `opts.border ?? 1` does not when
`border` is `number | null`.

## Options

`strict` lifts both gates. It is about how completely the codemod rewrites, not how
carefully — `strict: true` accepts the behavior change in exchange for leaving no
occurrence behind. `or` decides whether the truthy forms are looked at at all.

  source form                    default      strict: true   or: false
  ---------------------------    ----------   ------------   ----------
  a.b !== undefined ? a.b : f    convert      convert        convert
  a.b ?? f                       mayBeNull    convert        mayBeNull
  a.b != null ? a.b : f          mayBeNull    convert        mayBeNull
  a.b || f                       mayBeFalsy   convert        skip
  a.b ? a.b : f                  mayBeFalsy   convert        skip

## What no option reaches

Neither flag touches the structural skips, which are not safety judgements:

  a?.b ?? f              `a` may be undefined, and `= a` would throw where `a?.b` did not
  a.b !== null ? a.b : f falls back on null but not undefined — no pattern default means this
  const x: T = a.b ?? f  an annotation types the whole pattern, not one element
  a['b'] ?? f            element access is not parsed (a string-literal key could be)
  (a.b ?? f)             a parenthesized initializer is not the binary expression
  a.b ?? c.d ?? f        the left operand is another chain, not a read
  a.b ?? () => {\n...}   a fallback spanning lines would wreck the pattern's shape
  const a = a.b ?? f     the binding would shadow the object it destructures

## Merging

A run merges when the statements are adjacent, share a declaration kind and the same
object text, and carry no comment that merging would strand. Order is preserved, and
a later element's default may reference an earlier binding, which stays valid because
pattern elements bind left to right.
*/
export function destructureNullishDefaults(project: Project, options: DestructureNullishDefaultsOptions = {}) {
  for (const file of project.getSourceFiles()) {
    const edits = collectEdits(file, options)
    for (const edit of edits.reverse()) file.replaceText([edit.start, edit.end], edit.text)
  }
}

export type DestructureNullishDefaultsOptions = {
  /*
  Convert the reads the type cannot clear: ones that may be null, and truthy tests on
  values that may be falsy. This changes behavior wherever those values actually turn
  up, so it is off by default. It does not affect the structural skips.
  */
  strict?: boolean
  /*
  Whether truthy fallbacks (`a.b || f`, `a.b ? a.b : f`) are considered at all. On by
  default, where they still have to clear `mayBeFalsy` unless `strict` is set. Turn it
  off to restrict the codemod to `??` and the undefined/null tests.
  */
  or?: boolean
}

/* what a fallback fires on, which decides which gate a candidate has to clear */
type Mode = "undefined" | "nullish" | "truthy"

/* a property read paired with the value that stands in for it */
type Parsed = {
  read: PropertyAccessExpression
  fallback: Expression
  mode: Mode
}

/* a declarator that can become one element of a destructuring pattern */
type Candidate = {
  /* the property read off the object */
  prop: string
  /* the local binding it lands in */
  name: string
  /* source text of the fallback value */
  fallback: string
  /* source text of the object the property is read from */
  object: string
}

/* a variable statement whose every declarator is a candidate on the same object */
type Entry = {
  statement: VariableStatement
  candidates: Candidate[]
}

/* a span of the original file text and what replaces it */
type Edit = {
  start: number
  end: number
  text: string
}

/*
Analysis and rewriting are kept apart. Every edit is measured against the untouched
AST and then applied back to front as plain text, so no node is ever read after the
file has been mutated and nothing depends on ts-morph re-associating forgotten nodes.
*/
function collectEdits(file: SourceFile, options: DestructureNullishDefaultsOptions) {
  const edits: Edit[] = []
  for (const container of getContainers(file)) {
    for (const group of groupStatements(container.getStatements(), options)) edits.push(toEdit(group))
  }

  edits.sort((a, b) => a.start - b.start)

  // belt and braces: a nested edit would corrupt the one containing it, so the outer wins
  const kept: Edit[] = []
  let reach = -1
  for (const edit of edits) {
    if (edit.start < reach) continue
    kept.push(edit)
    reach = edit.end
  }
  return kept
}

/* every node that holds a statement list, since a run can only form inside one */
function getContainers(file: SourceFile) {
  return [
    file,
    ...file.getDescendantsOfKind(SyntaxKind.Block),
    ...file.getDescendantsOfKind(SyntaxKind.ModuleBlock),
    ...file.getDescendantsOfKind(SyntaxKind.CaseClause),
    ...file.getDescendantsOfKind(SyntaxKind.DefaultClause),
  ]
}

function groupStatements(statements: Node[], options: DestructureNullishDefaultsOptions) {
  const groups: Entry[][] = []
  let current: Entry[] = []
  const flush = () => {
    if (current.length) groups.push(current)
    current = []
  }

  for (const statement of statements) {
    if (!Node.isVariableStatement(statement)) {
      flush()
      continue
    }
    const candidates = getCandidates(statement, options)
    if (!candidates) {
      flush()
      continue
    }
    const entry: Entry = { statement, candidates }
    if (!current.length || !canJoin(current[current.length - 1], entry)) flush()
    current.push(entry)
  }

  flush()
  return groups
}

function canJoin(previous: Entry, next: Entry) {
  return (
    previous.statement.getDeclarationKind() === next.statement.getDeclarationKind() &&
    previous.candidates[0].object === next.candidates[0].object &&
    // a comment belongs to the line it was written on, and merging would strand it
    !hasTrailingComments(previous.statement) &&
    !hasLeadingComments(next.statement) &&
    !hasTrailingComments(next.statement)
  )
}

/*
A statement qualifies only when every one of its declarators does, reading from the
same object. One holdout disqualifies the statement, since half a pattern is no use.
*/
function getCandidates(statement: VariableStatement, options: DestructureNullishDefaultsOptions) {
  if (statement.hasExportKeyword() || statement.hasDeclareKeyword()) return
  // `using` and `await using` reject a binding pattern outright
  if (!DESTRUCTURABLE_KINDS.has(statement.getDeclarationKind())) return

  const candidates: Candidate[] = []
  for (const declaration of statement.getDeclarations()) {
    const candidate = getCandidate(declaration, options)
    if (!candidate) return
    if (candidates.length && candidate.object !== candidates[0].object) return
    candidates.push(candidate)
  }
  return candidates
}

function getCandidate(
  declaration: VariableDeclaration,
  options: DestructureNullishDefaultsOptions,
): Candidate | undefined {
  const nameNode = declaration.getNameNode()
  if (!Node.isIdentifier(nameNode)) return
  // an annotation types the whole pattern, and `!` has nowhere to go on an element
  if (declaration.getTypeNode() || declaration.hasExclamationToken()) return

  const parsed = parse(declaration.getInitializer())
  if (!parsed || !isConvertible(parsed, options)) return

  const fallback = parsed.fallback.getText()
  // a multi-line fallback wrecks the pattern's shape, and may hold a rewrite of its own
  if (fallback.includes("\n")) return

  const object = parsed.read.getExpression()
  const name = nameNode.getText()
  // `const opts = opts.opts ?? {}` would destructure the binding it is declaring
  if (getRootName(object) === name) return

  return { prop: parsed.read.getName(), name, fallback, object: object.getText() }
}

/* recognises the source forms in the table above, or nothing */
function parse(initializer: Expression | undefined): Parsed | undefined {
  if (Node.isBinaryExpression(initializer)) {
    const operator = initializer.getOperatorToken().getKind()
    const mode =
      operator === SyntaxKind.QuestionQuestionToken
        ? ("nullish" as const)
        : operator === SyntaxKind.BarBarToken
          ? ("truthy" as const)
          : undefined
    if (!mode) return
    const read = asRead(initializer.getLeft())
    return read && { read, fallback: initializer.getRight(), mode }
  }
  if (Node.isConditionalExpression(initializer)) return parseConditional(initializer)
}

/*
A ternary only qualifies when one branch repeats the tested read verbatim, so that
dropping the test leaves the same value behind. Which branch that is depends on the
operator: `!==` and `!=` keep it on the true branch, `===` and `==` on the false one.
*/
function parseConditional(node: ConditionalExpression): Parsed | undefined {
  const condition = node.getCondition()
  const whenTrue = node.getWhenTrue()
  const whenFalse = node.getWhenFalse()

  // `a.b ? a.b : f`, which is `||` written out
  const bare = asRead(condition)
  if (bare) return isSameRead(bare, whenTrue) ? { read: bare, fallback: whenFalse, mode: "truthy" } : undefined

  if (!Node.isBinaryExpression(condition)) return
  const operator = condition.getOperatorToken().getKind()
  const negated = operator === SyntaxKind.ExclamationEqualsEqualsToken || operator === SyntaxKind.ExclamationEqualsToken
  const affirmed = operator === SyntaxKind.EqualsEqualsEqualsToken || operator === SyntaxKind.EqualsEqualsToken
  if (!negated && !affirmed) return

  // either order: `a.b !== undefined` and `undefined !== a.b`
  const left = asRead(condition.getLeft())
  const read = left ?? asRead(condition.getRight())
  if (!read) return
  const against = getNullishText(left ? condition.getRight() : condition.getLeft())
  if (!against) return

  const [kept, fallback] = negated ? [whenTrue, whenFalse] : [whenFalse, whenTrue]
  if (!isSameRead(read, kept)) return

  // a loose test covers null and undefined both, which is exactly `??`
  const loose = operator === SyntaxKind.ExclamationEqualsToken || operator === SyntaxKind.EqualsEqualsToken
  // a strict test against null alone lets undefined through, which no pattern default expresses
  if (!loose && against === "null") return
  return { read, fallback, mode: loose ? "nullish" : "undefined" }
}

/*
Applies the gate the mode calls for. The three results are: always convertible (the
form already means what a pattern default means), convertible if the type clears the
gate, or convertible only under `strict`, which waives the gate.
*/
function isConvertible({ read, mode }: Parsed, options: DestructureNullishDefaultsOptions) {
  if (mode === "undefined") return true

  const strict = options.strict ?? false
  if (mode === "nullish") return strict || !mayBeNull(read.getType())
  if (!(options.or ?? true)) return false
  return strict || !mayBeFalsy(read.getType())
}

/* the property read a node is, if it is one a pattern could hold */
function asRead(node: Expression | undefined) {
  if (!node || !Node.isPropertyAccessExpression(node) || !isPlainAccess(node)) return
  return node
}

/* whether a branch repeats the tested read, so that dropping the test changes nothing */
function isSameRead(read: PropertyAccessExpression, node: Expression) {
  return node.getText() === read.getText()
}

function getNullishText(node: Expression) {
  if (node.getKind() === SyntaxKind.NullKeyword) return "null"
  if (Node.isIdentifier(node) && node.getText() === "undefined") return "undefined"
  if (Node.isVoidExpression(node) && node.getExpression().getText() === "0") return "undefined"
}

/*
Identifiers, `this`, and dotted chains of them. Everything else is rejected because it
cannot survive the move to the right of the `=`: `?.` because the object may be
undefined, `#private` and calls because the text would not re-read the same way, and
`super` because `= super` is a syntax error.
*/
function isPlainAccess(node: Node): boolean {
  if (Node.isIdentifier(node) || Node.isThisExpression(node)) return true
  if (!Node.isPropertyAccessExpression(node) || node.hasQuestionDotToken()) return false
  if (Node.isPrivateIdentifier(node.getNameNode())) return false
  return isPlainAccess(node.getExpression())
}

function getRootName(node: Node): string {
  return Node.isPropertyAccessExpression(node) ? getRootName(node.getExpression()) : node.getText()
}

function getParts(type: Type): Type[] {
  return type.isUnion() ? type.getUnionTypes().flatMap(getParts) : [type]
}

/* the `??` and `!= null` gate: null is the one value they catch that a default does not */
function mayBeNull(type: Type) {
  if (type.isAny() || type.isUnknown() || type.isTypeParameter()) return true
  return getParts(type).some(part => part.isNull())
}

/*
An allow-list rather than a deny-list: anything not known to be truthy (string, number,
boolean, bigint, enum, symbol, null, any, unknown, a type parameter) counts as possibly
falsy, so an unrecognised type errs toward leaving the code alone. undefined passes
because it is the one falsy value a pattern default does catch.
*/
function isNeverFalsy(part: Type) {
  if (part.isUndefined() || part.isVoid()) return true
  // covers objects, arrays, classes, interfaces and functions alike
  if (part.isObject()) return true
  if (part.isStringLiteral()) return part.getLiteralValue() !== ""
  if (part.isNumberLiteral()) return part.getLiteralValue() !== 0
  if (part.isBooleanLiteral()) return part.getText() === "true"
  return false
}

/* the `||` gate: every falsy value it catches beyond undefined would change meaning */
function mayBeFalsy(type: Type) {
  return !getParts(type).every(isNeverFalsy)
}

function hasLeadingComments(node: Node) {
  return node.getLeadingCommentRanges().length > 0
}

function hasTrailingComments(node: Node) {
  return node.getTrailingCommentRanges().length > 0
}

function toElement({ prop, name, fallback }: Candidate) {
  return prop === name ? `${name} = ${fallback}` : `${prop}: ${name} = ${fallback}`
}

/* the file's own indent step, measured from the statement where that is possible */
function getIndentUnit(statement: Node) {
  const own = statement.getIndentationText()
  const parent = statement.getParentOrThrow()
  const outer = Node.isSourceFile(parent) ? "" : parent.getIndentationText()
  if (own.length > outer.length) return own.slice(outer.length)
  return statement.getSourceFile().getProject().manipulationSettings.getIndentationText()
}

/*
One edit spans the whole run, from the first statement's start to the last one's end,
so merging and removing are the same operation. Both bounds sit inside the trivia, which
leaves the first statement's leading comment and the last one's trailing comment in place.
*/
function toEdit(group: Entry[]): Edit {
  const first = group[0].statement
  const last = group[group.length - 1].statement
  const kind = first.getDeclarationKind()
  const object = group[0].candidates[0].object
  const elements = group.flatMap(entry => entry.candidates).map(toElement)
  const semicolon = last.getText().endsWith(";") ? ";" : ""
  const indent = first.getIndentationText()

  const inline = `${kind} { ${elements.join(", ")} } = ${object}${semicolon}`
  const fits = elements.length <= MAX_INLINE_ELEMENTS && indent.length + inline.length <= MAX_LINE_LENGTH
  const unit = getIndentUnit(first)
  const text = fits
    ? inline
    : [
        `${kind} {`,
        ...elements.map(element => `${indent}${unit}${element},`),
        `${indent}} = ${object}${semicolon}`,
      ].join("\n")

  return { start: first.getStart(), end: last.getEnd(), text }
}
