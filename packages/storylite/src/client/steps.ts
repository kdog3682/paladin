import type { UserEvent } from "@testing-library/user-event"
import type { StepDef } from "../types"

const ACTIONS = ["click", "type", "keypress", "sleep", "expect", "eval", "text"] as const
const CHECKS = ["equals", "contains", "matches"] as const

/** while someone watches, every pause is at least this long */
const WATCH_SETTLE = 1_000

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<unknown>

/** `keypress ctrl+k` — what the step shows in the results */
export function labelOf(step: StepDef) {
  const action = ACTIONS.find((a) => step[a] !== undefined)
  if (!action) return "(no action)"
  const check = CHECKS.find((c) => step[c] !== undefined)
  const arg = action === "sleep" ? `${step.sleep}ms` : String(step[action])
  return `${action} ${arg}` + (check ? ` ${check} ${JSON.stringify(step[check])}` : "")
}

/** `ctrl+Enter` -> `{Control>}{Enter}{/Control}`, in user-event's keyboard syntax */
export function keysOf(combo: string) {
  const mods: Record<string, string> = { ctrl: "Control", control: "Control", alt: "Alt", shift: "Shift", cmd: "Meta", meta: "Meta" }
  const parts = combo.split("+")
  const key = parts.pop()!
  const held = parts.map((p) => mods[p.toLowerCase()] ?? p)
  const press = key.length === 1 && !"{[".includes(key) ? key : `{${key}}`
  return held.map((m) => `{${m}>}`).join("") + press + [...held].reverse().map((m) => `{/${m}}`).join("")
}

export type StepEnv = {
  userEvent: UserEvent
  /** ms an `expect` or a check keeps retrying */
  timeout: number
  /** watching: flash what a click is about to hit */
  slow: boolean
}

/** storylite's own sidebar and panel are in the page too; a step's selectors are about the story */
const own = (el: Element) => !el.closest("[data-sl-chrome]")
const all = (sel: string) => [...document.querySelectorAll(sel)].filter(own)

/** `document` as an `eval` sees it: the same, but queries skip storylite's own chrome */
const scoped = new Proxy(document, {
  get(target, key) {
    if (key === "querySelectorAll") return (sel: string) => all(sel)
    if (key === "querySelector") return (sel: string) => all(sel)[0] ?? null
    const value = Reflect.get(target, key, target)
    return typeof value === "function" ? value.bind(target) : value
  },
})

const text = (el: Element) => (el.textContent ?? "").trim()

function show(value: unknown) {
  return typeof value === "string" ? value : (JSON.stringify(value) ?? String(value))
}

function failedCheck(step: StepDef, value: string) {
  if (step.equals !== undefined && value !== String(step.equals)) return `expected ${JSON.stringify(value)} to equal ${JSON.stringify(String(step.equals))}`
  if (step.contains !== undefined && !value.includes(step.contains)) return `expected ${JSON.stringify(value)} to contain ${JSON.stringify(step.contains)}`
  if (step.matches !== undefined && !new RegExp(step.matches).test(value)) return `expected ${JSON.stringify(value)} to match /${step.matches}/`
  return null
}

/** retry `read` until it yields a value that passes the step's checks, or time runs out and the last problem is thrown */
async function settled(step: StepDef, timeout: number, read: () => unknown | Promise<unknown>) {
  const deadline = Date.now() + timeout
  for (;;) {
    let problem: string | null
    try {
      problem = failedCheck(step, show(await read()))
    } catch (err) {
      problem = err instanceof Error ? err.message : String(err)
    }
    if (!problem) return
    if (Date.now() >= deadline) throw new Error(problem)
    await sleep(50)
  }
}

async function find(sel: string, timeout: number) {
  const deadline = Date.now() + timeout
  for (;;) {
    const el = all(sel)[0]
    if (el) return el
    if (Date.now() >= deadline) throw new Error(`no element matches ${sel}`)
    await sleep(50)
  }
}

/** run one step against the page. throws when it fails */
export async function exec(step: StepDef, { userEvent, timeout, slow }: StepEnv) {
  // what an action did shows up a beat later. watching, that beat is long enough to see it
  const settle = () => sleep(slow ? WATCH_SETTLE : 100)
  if (step.click !== undefined) {
    const el = (await find(step.click, timeout)) as HTMLElement
    if (slow) {
      const before = el.style.outline
      el.style.outline = "2px solid #f59e0b"
      await sleep(450)
      el.style.outline = before
    }
    await userEvent.click(el)
    return settle()
  }
  if (step.type !== undefined) {
    await userEvent.keyboard(step.type.replace(/[{[]/g, (c) => c + c))
    return settle()
  }
  if (step.keypress !== undefined) {
    await userEvent.keyboard(keysOf(step.keypress))
    return settle()
  }
  // checks retry, so a sleep is rarely needed. watching, it never goes under the floor
  if (step.sleep !== undefined) return sleep(slow ? Math.max(step.sleep, WATCH_SETTLE) : step.sleep)
  if (step.expect !== undefined) {
    const gone = step.expect.startsWith("!")
    const sel = gone ? step.expect.slice(1) : step.expect
    return settled(step, timeout, () => {
      const found = all(sel).length
      if (gone ? found : !found) throw new Error(gone ? `${sel} is still there (×${found})` : `no element matches ${sel}`)
      return `×${found}`
    })
  }
  if (step.eval !== undefined) {
    const js = step.eval
    return settled(step, timeout, () => new AsyncFunction("document", `return (${js})`)(scoped))
  }
  if (step.text !== undefined) {
    const sel = step.text
    return settled(step, timeout, () => {
      const els = all(sel)
      if (!els.length) throw new Error(`no element matches ${sel}`)
      return els.map(text).join(" | ")
    })
  }
  throw new Error(`a step needs one action (${ACTIONS.join(", ")}), got ${Object.keys(step).join(", ") || "nothing"}`)
}
