import { createHash } from "node:crypto"
import { Node } from "ts-morph"
import { formatDocComment, getDocTarget } from "../../utils/comments"
import { isPublicMember } from "../../utils/getPublicSurface"
import type { TextEdit } from "../../utils/textEdits"
import { applyTextEdits } from "../../utils/textEdits"
import { getBodies, type AuditEntry, type AuditStatus } from "./collect"

export type AuditRequest = {
  /* short code the response has to repeat; derived from the entries, so an unchanged project gives the same one */
  nonce: string
  /* the number the writer sees -> the entry it stands for */
  ids: Record<number, { id: string, hash: string }>
  /* every declaration of the public api, grouped by file, with the entries that need work numbered */
  declarations: string
}

const LABELS: Record<Exclude<AuditStatus, "ok">, string> = {
  missing: "✗ missing",
  long: "✎ long",
}

const MAX_BODY_LINES = 150

/*
 * Numbers the entries that need a comment and prints every declaration the way the docs show
 * it: label, current comment, then the declaration with private members removed and bodies
 * elided. Only a numbered function keeps its own body, so the writer can see what it does.
 */
export function renderRequest(entries: AuditEntry[]): AuditRequest {
  const ids: AuditRequest["ids"] = {}
  const numbers = new Map<AuditEntry, number>()
  for (const entry of entries.flatMap(entry => [entry, ...entry.members])) {
    if (entry.status === "ok") continue
    const n = numbers.size + 1
    numbers.set(entry, n)
    ids[n] = { id: entry.id, hash: entry.hash }
  }

  const files = new Map<string, string[]>()
  for (const entry of entries) {
    const file = entry.id.slice(0, entry.id.indexOf("#"))
    files.set(file, [...(files.get(file) ?? []), renderEntry(entry, numbers)])
  }
  const declarations = [...files]
    .map(([file, blocks]) => `## ${file}\n\n${blocks.join("\n\n")}`)
    .join("\n\n")
  const nonce = createHash("sha1").update(JSON.stringify(ids)).digest("hex").slice(0, 6)
  return { nonce, ids, declarations }
}

function renderEntry(entry: AuditEntry, numbers: Map<AuditEntry, number>): string {
  const lines: string[] = []
  const n = numbers.get(entry)
  if (n) lines.push(label(n, entry.status))
  if (entry.comment) lines.push(formatDocComment(entry.comment))

  const holder = getDocTarget(entry.node)
  const hidden = Node.isClassDeclaration(holder) ? holder.getMembers().filter(member => !isPublicMember(member)) : []
  const isHidden = (node: Node) => hidden.some(member => node.getStart() >= member.getFullStart() && node.getEnd() <= member.getEnd())
  const edits: TextEdit[] = [
    ...entry.members.flatMap(member => {
      const memberNumber = numbers.get(member)
      return memberNumber ? [labelEdit(member.node, label(memberNumber, member.status))] : []
    }),
    ...hidden.map(member => ({ start: member.getFullStart(), end: member.getEnd(), text: "" })),
    ...getBodies(holder).filter(body => !isHidden(body)).map(body => bodyEdit(body, entry.node, !!n)),
  ]
  lines.push(applyTextEdits(holder.getText(), edits, holder.getStart()))
  return lines.join("\n")
}

function label(n: number, status: AuditStatus): string {
  return `[${n}] ${LABELS[status as Exclude<AuditStatus, "ok">]}`
}

function labelEdit(node: Node, text: string): TextEdit {
  const target = getDocTarget(node)
  const start = target.getStart()
  const full = target.getSourceFile().getFullText()
  const indent = full.slice(full.lastIndexOf("\n", start - 1) + 1, start)
  return { start, end: start, text: /^[ \t]*$/.test(indent) ? `${text}\n${indent}` : `${text} ` }
}

function bodyEdit(body: Node, declaration: Node, numbered: boolean): TextEdit {
  const edit = { start: body.getStart(), end: body.getEnd() }
  if (numbered && isOwnBody(body, declaration)) return { ...edit, text: truncate(body.getText()) }
  return { ...edit, text: Node.isBlock(body) ? "{ … }" : "…" }
}

function isOwnBody(body: Node, declaration: Node): boolean {
  const owner = body.getParent()
  if (owner === declaration) return true
  return Node.isVariableDeclaration(declaration) && owner === declaration.getInitializer()
}

function truncate(text: string): string {
  const lines = text.split("\n")
  if (lines.length <= MAX_BODY_LINES) return text
  return [...lines.slice(0, MAX_BODY_LINES), `  // … ${lines.length - MAX_BODY_LINES} more lines`, "}"].join("\n")
}
