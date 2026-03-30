// @paladin/ai/claude/index.ts

import { $ } from "bun"
import { randomUUID } from "crypto"

type ClaudeParams = {
  prompt: string
  cwd?: string
  files?: string[]
  systemPrompt?: string
  model?: string
  maxTurns?: number
  allowedTools?: string[]
  outputFormat?: "text" | "json" | "stream-json"
}

type ResumeMode = "auto" | string | null

class ClaudeCode {
  readonly id: string

  constructor(id?: string) {
    this.id = id ?? randomUUID()
  }

  private hasRun = false

  async run(params: ClaudeParams): Promise<string> {
    const {
      prompt,
      cwd,
      files = [],
      systemPrompt,
      model,
      maxTurns,
      allowedTools,
      outputFormat = "text",
    } = params

    const args: string[] = ["-p", prompt, "--output-format", outputFormat]

    if (systemPrompt) args.push("--system-prompt", systemPrompt)
    if (model) args.push("--model", model)
    if (maxTurns) args.push("--max-turns", String(maxTurns))
    if (allowedTools?.length) args.push("--allowedTools", allowedTools.join(","))
    for (const f of files) args.push("--file", f)

    if (this.hasRun) {
      args.push("--resume", this.id)
    }

    const result = await $`claude ${args}`.cwd(cwd ?? process.cwd()).text()
    this.hasRun = true

    return result
  }
}

const sessions = new Map<string, ClaudeCode>()
let lastSession: ClaudeCode | null = null

export async function claude(
  params: ClaudeParams,
  resume: ResumeMode = null
): Promise<string> {
  let instance: ClaudeCode

  if (resume === "auto") {
    instance = lastSession ?? new ClaudeCode()
  } else if (typeof resume === "string") {
    instance = sessions.get(resume) ?? new ClaudeCode(resume)
  } else {
    instance = new ClaudeCode()
  }

  sessions.set(instance.id, instance)
  lastSession = instance

  return instance.run(params)
}

export { ClaudeCode }
export type { ClaudeParams, ResumeMode }
