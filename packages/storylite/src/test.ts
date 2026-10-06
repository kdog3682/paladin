import puppeteer from "puppeteer"
import type { Report, Result } from "./types"

export type Outcome = { report: Report; pageErrors: string[]; errors: string[]; warnings: string[]; failedRequests: string[] }

/**
 * load the story page in headless chrome and wait for it to finish running every
 * story. the page is the same one you'd open — the CLI only reads what it left on
 * `window.__storylite`, so what it reports is what the browser shows.
 */
export async function collect(url: string, timeout = 60_000): Promise<Outcome> {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] })
  try {
    const page = await browser.newPage()
    const pageErrors: string[] = []
    const errors: string[] = []
    const warnings: string[] = []
    const failedRequests: string[] = []
    page.on("pageerror", (err) => pageErrors.push(String((err as Error).message ?? err)))
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text())
      else if (msg.type() === "warning") warnings.push(msg.text())
    })
    page.on("requestfailed", (req) => failedRequests.push(`${req.url()} (${req.failure()?.errorText ?? "failed"})`))
    page.on("response", (res) => res.status() >= 400 && failedRequests.push(`${res.url()} (${res.status()})`))

    await page.goto(new URL("?headless", url).href, { waitUntil: "load" })
    // vite can reload the page once if it finds a dependency late; the flag simply resets and the run restarts
    await page.waitForFunction(() => (window as any).__storylite?.done === true, { timeout, polling: 100 }).catch(() => {
      throw new Error(`stories did not finish within ${timeout / 1000}s${pageErrors.length ? `\n${pageErrors.join("\n")}` : ""}`)
    })
    const report = (await page.evaluate(() => (window as any).__storylite)) as Report
    return { report, pageErrors, errors, warnings, failedRequests }
  } finally {
    await browser.close()
  }
}

const first = (text: string, lines = 12) => {
  const all = text.split("\n")
  return all.slice(0, lines).join("\n") + (all.length > lines ? `\n… ${all.length - lines} more lines` : "")
}
const indent = (text: string, by: string) => text.split("\n").map((l) => by + l).join("\n")

/** the summary the CLI prints, grouped by file in the order the page listed them */
export function format({ report, pageErrors, errors, warnings, failedRequests }: Outcome) {
  const byFile = new Map<string, Result[]>()
  for (const r of report.results) byFile.set(r.file, [...(byFile.get(r.file) ?? []), r])

  const lines: string[] = []
  for (const [file, results] of byFile) {
    lines.push(`${results[0]!.title}  (${file})`)
    for (const r of results) {
      const mark = r.status === "pass" ? "✓" : "✗"
      const kind = (r.play ? "" : "  (render only)") + (r.retried ? "  (passed on retry: flaky)" : "")
      lines.push(`  ${mark} ${r.name}  ${r.ms}ms${kind}`)
      // a passing story is one line; the steps are for working out where a failing one went wrong
      if (r.status !== "pass") for (const s of r.steps) lines.push(`      ${s.status === "pass" ? "✓" : s.status === "fail" ? "✗" : "·"} ${s.name}${s.desc ? `  — ${s.desc}` : ""}`)
      if (r.error) lines.push(indent(first(r.error), "      "))
    }
    lines.push("")
  }
  for (const { file, error } of report.errors) lines.push(`✗ ${file} failed to import`, indent(first(error), "    "), "")

  const failed = report.results.filter((r) => r.status !== "pass").length + report.errors.length
  lines.push(`${report.results.length - report.results.filter((r) => r.status !== "pass").length} passed, ${failed} failed`)
  if (pageErrors.length) lines.push("", "uncaught errors on the page:", ...pageErrors.map((e) => indent(first(e, 4), "  ")))
  // the same sections webrun reports, so an agent reads both the same way
  const section = (title: string, items: string[]) => {
    const unique = [...new Set(items)]
    lines.push("", `## ${title}`, ...(unique.length ? unique.map((e) => indent(first(e, 6), "")) : ["none"]))
  }
  section("console errors", errors)
  section("console warnings", warnings)
  section("failed requests", failedRequests)
  return lines.join("\n")
}

export const ok = ({ report, pageErrors, errors }: Outcome) =>
  report.results.every((r) => r.status === "pass") && report.errors.length === 0 && pageErrors.length === 0 && errors.length === 0
