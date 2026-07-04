import { $ } from "bun"
import { randomUUID } from "crypto"

// Known aliases + full model strings; (string & {}) keeps arbitrary strings valid
// while preserving autocomplete for the common ones.
type ClaudeModel =
  | "opus"
  | "sonnet"
  | "haiku"
  | "claude-opus-4-8"
  | "claude-sonnet-5"
  | "claude-haiku-4-5-20251001"
  | (string & {})

type ClaudeParams = {
  prompt: string
  cwd?: string // working dir for the spawned process (defaults to process.cwd())
  files?: string[] // paths passed via --file, added to context
  systemPrompt?: string // override system prompt — we don't normally use this
  model?: ClaudeModel // alias or full model string; omit to use CLI default
  maxTurns?: number // agentic turn cap — we don't normally use this
  allowedTools?: string[] // tool allowlist — we don't normally use this
  outputFormat?: "text" | "json" | "stream-json" // json exposes usage + cost
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
      outputFormat = "json", // default to json so usage/cost is always available
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

// Fires the /usage slash command through print mode. With outputFormat "json"
// the returned envelope carries total_cost_usd + usage, which is how the test
// checks whether asking for usage itself burns tokens/money.
export async function getUsage(cwd?: string): Promise<string> {
  const result = await $`claude -p ${"/usage"} --output-format json`
    .cwd(cwd ?? process.cwd())
    .text()
  return result
}

export { ClaudeCode }
export type { ClaudeModel, ClaudeParams }
