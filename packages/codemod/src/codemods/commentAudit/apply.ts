import type { Node, Project, SourceFile } from "ts-morph"
import { getDocCommentEdit, getDocTarget, parseCommentText } from "../../utils/comments"
import { applyTextEdits, type TextEdit } from "../../utils/textEdits"
import { collectEntries, type CollectOptions } from "./collect"
import type { AuditResponse } from "./parse"

export type ApplyReport = {
  /* ids whose comment was written */
  applied: string[]
  /* comments that weren't written, as `<id>: <reason>` */
  skipped: string[]
  /* ids that still have no comment */
  missing: string[]
}

/*
 * Writes the comments of a response above the entries they belong to, replacing the comment
 * already there. An entry whose signature changed since the request (its hash differs) is
 * skipped rather than guessed at. All edits are computed first and applied as one text edit per
 * file, so no node goes stale halfway through.
 */
export function applyComments(
  project: Project,
  response: Pick<AuditResponse, "comments">,
  opts: CollectOptions = {},
): ApplyReport {
  const entries = collectEntries(project, opts).flatMap(entry => [entry, ...entry.members])
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  const edits = new Map<SourceFile, TextEdit[]>()
  const targets = new Set<Node>()
  const report: ApplyReport = { applied: [], skipped: [], missing: [] }

  for (const { id, hash, text } of response.comments) {
    const entry = byId.get(id)
    const comment = parseCommentText(text)
    const target = entry && getDocTarget(entry.node)
    if (!entry || !target) report.skipped.push(`${id}: no such entry`)
    else if (hash && hash !== entry.hash) report.skipped.push(`${id}: changed since the request`)
    else if (!comment) report.skipped.push(`${id}: empty comment`)
    else if (targets.has(target)) report.skipped.push(`${id}: shares its comment with another entry`)
    else {
      targets.add(target)
      const file = target.getSourceFile()
      edits.set(file, [...(edits.get(file) ?? []), getDocCommentEdit(entry.node, comment)])
      report.applied.push(id)
    }
  }

  for (const [file, fileEdits] of edits) file.replaceWithText(applyTextEdits(file.getFullText(), fileEdits))
  const applied = new Set(report.applied)
  report.missing = entries.filter(entry => entry.status === "missing" && !applied.has(entry.id)).map(entry => entry.id)
  return report
}
