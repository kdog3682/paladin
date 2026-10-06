import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { parse } from "yaml"
import { ACTION_KEYS, CHECK_KEYS, type Step } from "./actions"
import { probe, type ProbeResult } from "./run"

export type Scenario = {
  name: string
  /** picks an example in a gallery before the steps run, like a leading `hash` step */
  hash?: string
  steps: Step[]
}

export type Script = {
  file: string
  /** the app to serve, resolved against the script's directory; absent means probe whatever is running */
  app?: string
  /** a console error fails its scenario. @default true */
  failOnConsole: boolean
  /** ms `expect` waits for its selector */
  timeout?: number
  scenarios: Scenario[]
}

const SCENARIO_KEYS = new Set(["name", "hash", "steps"])
const TOP_KEYS = new Set(["app", "failOnConsole", "timeout", "scenarios"])
const STEP_KEYS = new Set<string>([...ACTION_KEYS, ...CHECK_KEYS])

export const isScript = (target: string) => /\.ya?ml$/i.test(target)

function stepOf(raw: unknown, where: string): Step {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${where}: a step is a mapping like {keypress: ctrl+k}`)
  const keys = Object.keys(raw)
  const actions = keys.filter((k) => (ACTION_KEYS as string[]).includes(k))
  if (actions.length !== 1) {
    throw new Error(`${where}: a step needs exactly one action (${ACTION_KEYS.join(", ")}), got ${actions.length ? actions.join(" + ") : keys.join(", ") || "nothing"}`)
  }
  const unknown = keys.filter((k) => !STEP_KEYS.has(k))
  if (unknown.length) throw new Error(`${where}: unknown key ${unknown.join(", ")} (checks are ${CHECK_KEYS.join(", ")})`)

  // yaml reads `sleep: 300` as a number and `type: 5` as one too; the probe wants the flag's own type
  const step: Record<string, unknown> = { ...raw }
  const action = actions[0]!
  if (action !== "sleep" && action !== "reload") step[action] = String(step[action])
  return step as Step
}

export async function loadScript(file: string): Promise<Script> {
  const doc = parse(await readFile(file, "utf8")) as Record<string, unknown> | null
  if (!doc || typeof doc !== "object") throw new Error(`${file}: expected a mapping with scenarios`)
  for (const key of Object.keys(doc)) if (!TOP_KEYS.has(key)) throw new Error(`${file}: unknown key ${key}`)
  if (!Array.isArray(doc.scenarios) || !doc.scenarios.length) throw new Error(`${file}: scenarios must be a non-empty list`)

  const scenarios = doc.scenarios.map((raw: Record<string, unknown>, i: number): Scenario => {
    const where = `${file}: scenario ${i + 1}`
    for (const key of Object.keys(raw)) if (!SCENARIO_KEYS.has(key)) throw new Error(`${where}: unknown key ${key}`)
    if (typeof raw.name !== "string") throw new Error(`${where}: name is required`)
    if (!Array.isArray(raw.steps)) throw new Error(`${where} (${raw.name}): steps must be a list`)
    return {
      name: raw.name,
      hash: raw.hash === undefined ? undefined : String(raw.hash).replace(/^#/, ""),
      steps: raw.steps.map((s, n) => stepOf(s, `${where} (${raw.name}), step ${n + 1}`)),
    }
  })

  return {
    file,
    app: typeof doc.app === "string" ? resolve(dirname(file), doc.app) : undefined,
    failOnConsole: doc.failOnConsole !== false,
    timeout: typeof doc.timeout === "number" ? doc.timeout : undefined,
    scenarios,
  }
}

export type ScenarioResult = { scenario: Scenario; result: ProbeResult; ok: boolean }

/** every scenario gets a fresh browser and page load, so one cannot leave state behind for the next */
export async function runScript(script: Script, url: string): Promise<ScenarioResult[]> {
  const out: ScenarioResult[] = []
  for (const scenario of script.scenarios) {
    const actions: Step[] = [...(scenario.hash ? [{ hash: scenario.hash }] : []), ...scenario.steps]
    const result = await probe({ url, actions, timeout: script.timeout })
    out.push({ scenario, result, ok: result.ok && !(script.failOnConsole && result.errors.length) })
  }
  return out
}

export function formatScript(script: Script, results: ScenarioResult[], verbose = false) {
  const mark = { ok: "✓", fail: "✗", skipped: "-" }
  const lines = [`script ${script.file} · ${results.length} scenario${results.length === 1 ? "" : "s"}`]
  for (const { scenario, result, ok } of results) {
    lines.push(`${ok ? "✓" : "✗"} ${scenario.name}`)
    // a passing scenario is one line; a failing one shows every step so the break is in context
    if (ok && !verbose) continue
    for (const a of result.actions) lines.push(`    ${mark[a.status]} ${a.label}${a.detail ? ` → ${a.detail}` : ""}`)
    if (script.failOnConsole) for (const e of result.errors) lines.push(`    ! console error: ${e}`)
  }
  const passed = results.filter((r) => r.ok).length
  lines.push("", `${passed}/${results.length} passed`)
  return lines.join("\n")
}
