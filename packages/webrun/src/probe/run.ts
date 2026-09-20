import puppeteer, { type Page } from "puppeteer"
import { parseCombo } from "./keys"
import type { Action } from "./actions"
import { PREVIEW_MAX_LINES, readOutline } from "./preview"

export type ProbeOpts = {
  url: string
  actions?: Action[]
  /** how long `expect` waits for its selector. @default 2000 */
  timeout?: number
  /** also capture a compact outline of the page after the actions have run */
  preview?: boolean
}

export type ActionResult = {
  label: string
  status: "ok" | "fail" | "skipped"
  /** what the action found or returned */
  detail?: string
}

export type ProbeResult = {
  url: string
  title: string
  actions: ActionResult[]
  /** compact outline of the page, only when `preview` was asked for */
  preview?: string[]
  fonts: string[]
  fontRequests: string[]
  failedRequests: string[]
  errors: string[]
  warnings: string[]
  ok: boolean
}

const NAV_TIMEOUT = 15_000
const SETTLE = 500
const ACTION_SLEEP = 300

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s)

/** runs in the page. a font is only fetched once text uses it, so unused faces stay `unloaded` */
const readFonts = async () => {
  await document.fonts.ready
  return [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`)
}

async function press(page: Page, combo: string) {
  const { modifiers, key } = parseCombo(combo)
  for (const m of modifiers) await page.keyboard.down(m)
  try {
    await page.keyboard.press(key)
  } finally {
    for (const m of modifiers.reverse()) await page.keyboard.up(m)
  }
}

async function expectSelector(page: Page, spec: string, timeout: number) {
  const absent = spec.startsWith("!")
  const sel = absent ? spec.slice(1) : spec
  if (absent) {
    try {
      await page.waitForFunction((s) => !document.querySelector(s), { timeout }, sel)
    } catch {
      throw new Error(`${sel} still present after ${timeout}ms`)
    }
    return "gone"
  }
  try {
    await page.waitForSelector(sel, { timeout })
  } catch {
    throw new Error(`${sel} not found after ${timeout}ms`)
  }
  const { n, text } = await page.$$eval(sel, (els) => ({
    n: els.length,
    text: (els[0].textContent ?? "").trim().replace(/\s+/g, " "),
  }))
  return `×${n}${text ? ` "${clip(text)}"` : ""}`
}

/** runs one action, records it in `out`, and rethrows on failure so the caller can skip the rest */
async function runAction(page: Page, action: Action, timeout: number, out: ActionResult[]) {
  const did = async (label: string, fn: () => Promise<string | void>, settle = false) => {
    try {
      const detail = (await fn()) || undefined
      if (settle) await sleep(ACTION_SLEEP)
      out.push({ label, status: "ok", detail })
    } catch (e) {
      out.push({ label, status: "fail", detail: (e as Error).message })
      throw e
    }
  }

  if ("click" in action) return did(`click ${action.click}`, () => page.click(action.click), true)
  if ("type" in action)
    return did(`type ${JSON.stringify(action.type)}`, () => page.keyboard.type(action.type), true)
  if ("keypress" in action) return did(`keypress ${action.keypress}`, () => press(page, action.keypress), true)
  if ("sleep" in action) return did(`sleep ${action.sleep}ms`, () => sleep(action.sleep))
  if ("expect" in action) return did(`expect ${action.expect}`, () => expectSelector(page, action.expect, timeout))
  if ("eval" in action)
    return did(`eval ${clip(action.eval)}`, async () => {
      const r = await page.evaluate(`(async () => (${action.eval}))()`)
      return r === undefined ? "undefined" : clip(typeof r === "string" ? r : JSON.stringify(r), 400)
    })
  if ("screenshot" in action)
    return did(
      `screenshot ${action.screenshot}`,
      async () => void (await page.screenshot({ path: action.screenshot as `${string}.png` })),
    )
}

export async function probe({ url, actions = [], timeout = 2000, preview = false }: ProbeOpts): Promise<ProbeResult> {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] })
  try {
    const page = await browser.newPage()
    const result: ProbeResult = {
      url,
      title: "",
      actions: [],
      fonts: [],
      fontRequests: [],
      failedRequests: [],
      errors: [],
      warnings: [],
      ok: true,
    }
    // messages logged while an action runs are tagged with it, so a crash points at its trigger
    let at = "load"
    const tag = (s: string) => (at === "load" ? s : `[${at}] ${s}`)

    page.on("response", (r) => {
      const line = `${r.status()} ${r.url()}`
      if (r.status() >= 400) result.failedRequests.push(line)
      else if (/\.(woff2?|ttf|otf)(\?|$)/.test(r.url())) result.fontRequests.push(line)
    })
    page.on("console", (m) => {
      if (m.type() === "error") result.errors.push(tag(m.text()))
      else if (m.type() === "warn") result.warnings.push(tag(m.text()))
    })
    page.on("pageerror", (e) => result.errors.push(tag(String(e))))

    try {
      await page.goto(url, { waitUntil: "networkidle0", timeout: NAV_TIMEOUT })
    } catch (e) {
      throw new Error(`could not load ${url}: ${(e as Error).message}\nis the server running? try \`webrun --status\``)
    }
    await sleep(SETTLE)
    result.title = await page.title()

    for (const [i, action] of actions.entries()) {
      if (!result.ok) {
        result.actions.push({ label: `action ${i + 1}`, status: "skipped" })
        continue
      }
      at = `action ${i + 1}`
      try {
        await runAction(page, action, timeout, result.actions)
      } catch {
        result.ok = false // the failing action is already recorded; the rest are skipped
      }
    }
    at = "load"

    if (preview) result.preview = await page.evaluate(readOutline, PREVIEW_MAX_LINES)
    result.fonts = await page.evaluate(readFonts)
    return result
  } finally {
    await browser.close()
  }
}

export function formatReport(r: ProbeResult) {
  const section = (title: string, body: string | string[]) =>
    `\n## ${title}\n${Array.isArray(body) ? (body.length ? body.join("\n") : "none") : body}`
  const mark = { ok: "✓", fail: "✗", skipped: "-" }

  // unused faces are always "unloaded"; only the ones text actually asked for are interesting
  const used = r.fonts.filter((f) => !f.endsWith(" unloaded"))
  const unused = r.fonts.length - used.length
  const fonts = [...used, ...(unused ? [`(${unused} declared faces unused on this page)`] : [])]

  return [
    `${r.ok ? "ok" : "FAILED"} · ${r.url}${r.title ? ` · "${r.title}"` : ""}`,
    ...(r.actions.length
      ? [section("actions", r.actions.map((s) => `${mark[s.status]} ${s.label}${s.detail ? ` → ${s.detail}` : ""}`))]
      : []),
    ...(r.preview ? [section("page", r.preview)] : []),
    section("console errors", r.errors),
    section("console warnings", r.warnings),
    section("failed requests", r.failedRequests),
    section("fonts", fonts),
    ...(r.fontRequests.length ? [section("font requests", r.fontRequests)] : []),
  ].join("\n")
}
