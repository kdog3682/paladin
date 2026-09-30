import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { Project } from "ts-morph"
import { applyComments, type ApplyReport } from "./apply"
import { collectEntries, type CollectOptions } from "./collect"
import { parseResponse, readNonce } from "./parse"
import { renderPrompt } from "./prompt"
import { renderRequest, type AuditRequest } from "./render"

export { applyComments, type ApplyReport } from "./apply"
export { parseResponse, type AuditComment, type AuditResponse } from "./parse"
export type { AuditRequest } from "./render"
export type { CollectOptions } from "./collect"

export type CommentAuditOptions = CollectOptions & {
  /* folder the request is written to and the response is picked up from; `~/scratch` by default */
  inbox?: string
  /* how long to wait for the response before giving up; no limit by default */
  timeoutMs?: number
  /* nonce of an earlier run to pick up again, reusing its request instead of writing a new one */
  resume?: string
}

type PendingRequest = Pick<AuditRequest, "nonce" | "ids">

/* Collects the public api's comments and renders the request for them, without writing anything. */
export function collectComments(project: Project, opts: CollectOptions = {}): AuditRequest {
  return renderRequest(collectEntries(project, opts))
}

/*
 * Makes sure every part of the public api has a comment. Writes a request listing the missing
 * and overlong comments to the inbox, waits for a `commentAudit*.txt` answer with the same
 * nonce, then writes the comments it contains back into the source. Resolves with nothing when
 * every comment is already in place.
 */
export async function commentAudit(project: Project, opts: CommentAuditOptions = {}): Promise<ApplyReport | undefined> {
  const inbox = (opts.inbox ?? "~/scratch").replace(/^~(?=\/|$)/, homedir())
  await mkdir(inbox, { recursive: true })
  const since = opts.resume ? 0 : Date.now()
  const request = opts.resume ? await loadRequest(inbox, opts.resume) : await writeRequest(project, inbox, opts)
  if (!request) return

  const response = parseResponse(await waitForResponse(inbox, request.nonce, since, opts.timeoutMs), request)
  for (const problem of response.problems) console.warn(`commentAudit: ${problem}`)
  const report = applyComments(project, response, opts)
  console.log(`commentAudit: wrote ${report.applied.length} comments`)
  for (const skipped of report.skipped) console.warn(`commentAudit: skipped ${skipped}`)
  if (report.missing.length) console.warn(`commentAudit: still missing\n  ${report.missing.join("\n  ")}`)
  return report
}

async function writeRequest(project: Project, inbox: string, opts: CollectOptions): Promise<PendingRequest | undefined> {
  const request = collectComments(project, opts)
  const count = Object.keys(request.ids).length
  if (!count) {
    console.log("commentAudit: every part of the public api has a comment")
    return
  }
  const path = join(inbox, "commentAudit.request.md")
  await writeFile(path, `${renderPrompt(request.nonce)}\n\n${request.declarations}\n`)
  await writeFile(idsPath(inbox, request.nonce), JSON.stringify({ nonce: request.nonce, ids: request.ids }, null, 2))
  console.log(`commentAudit: ${count} comments requested in ${path}`)
  console.log(`commentAudit: waiting for commentAudit.txt in ${inbox} (resume with nonce ${request.nonce})`)
  return request
}

async function loadRequest(inbox: string, nonce: string): Promise<PendingRequest> {
  return JSON.parse(await readFile(idsPath(inbox, nonce), "utf8"))
}

function idsPath(inbox: string, nonce: string): string {
  return join(inbox, `commentAudit.${nonce}.ids.json`)
}

async function waitForResponse(inbox: string, nonce: string, since: number, timeoutMs = Infinity): Promise<string> {
  const deadline = Date.now() + timeoutMs
  const ignored = new Set<string>()
  while (Date.now() < deadline) {
    const candidates = await Promise.all(
      (await readdir(inbox))
        .filter(name => /^commentAudit.*\.txt$/.test(name))
        .map(async name => ({ path: join(inbox, name), mtime: (await stat(join(inbox, name))).mtimeMs })),
    )
    for (const { path } of candidates.filter(file => file.mtime >= since - 1000).sort((a, b) => b.mtime - a.mtime)) {
      const text = await readFile(path, "utf8")
      if (readNonce(text) === nonce) return text
      if (!ignored.has(path)) {
        ignored.add(path)
        console.warn(`commentAudit: ignoring ${path}, its nonce isn't ${nonce}`)
      }
    }
    await Bun.sleep(2000)
  }
  throw new Error(`commentAudit: no response with nonce ${nonce} in ${inbox}`)
}
