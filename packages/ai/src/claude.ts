import { $ } from "bun"

type Options = {
  prompt: string
  cwd?: string
  files?: string[]
  systemPrompt?: string
  model?: "opus" | "sonnet" | "haiku"
  maxTurns?: number
  allowedTools?: string[] // omit to allow everything
  resume?: boolean | string // true continues the last run, a string is a named session
}

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  cache_creation?: {
    ephemeral_5m_input_tokens: number
    ephemeral_1h_input_tokens: number
  }
  server_tool_use?: { web_search_requests: number }
  service_tier?: string
}

type Result = {
  type: "result"
  subtype: "success" | "error_max_turns" | "error_during_execution"
  is_error: boolean
  result: string
  structured_output?: unknown // only present when run with --json-schema
  session_id: string
  num_turns: number
  duration_ms: number
  duration_api_ms: number
  total_cost_usd: number
  usage: Usage
}

const sessions = new Map<string, string>()
let lastSessionId: string | null = null

function resolveSessionId(resume: boolean | string): string | null {
  if (resume === true) return lastSessionId
  if (typeof resume === "string") return sessions.get(resume) ?? null
  return null
}

/**
 * Runs Claude Code headlessly and returns the parsed result envelope
 * (text in `.result`, plus session id, usage, and cost).
 * Permissions are skipped, so it can edit and run anything under `cwd`.
 */
export async function claude(options: Options): Promise<Result> {
  const {
    prompt,
    cwd = process.cwd(),
    files = [],
    systemPrompt,
    model = "sonnet",
    maxTurns,
    allowedTools,
    resume = false,
  } = options

  const args: string[] = [
    "-p",
    prompt,
    "--model",
    model,
    "--output-format",
    "json",
    "--dangerously-skip-permissions",
  ]

  if (systemPrompt) args.push("--system-prompt", systemPrompt)
  if (maxTurns) args.push("--max-turns", String(maxTurns))
  if (allowedTools?.length) args.push("--allowedTools", allowedTools.join(","))
  for (const f of files) args.push("--file", f)

  const sessionId = resolveSessionId(resume)
  if (sessionId) args.push("--resume", sessionId)

  const raw = await $`claude ${args}`.cwd(cwd).text()
  const envelope = JSON.parse(raw) as Result

  lastSessionId = envelope.session_id
  if (typeof resume === "string") sessions.set(resume, envelope.session_id)

  return envelope
}

export type { Options, Result, Usage }
