import type { MochiSuiteResult, MochiResult } from "./types"

const CALL_WIDTH = 40
const ARROW = "→"

function renderValue(result: MochiResult): string {
  if (result.error) return `! ${result.error.message}`
  return JSON.stringify(result.value) ?? "undefined"
}

function renderCall(source: string): string {
  return source.length > CALL_WIDTH ? source.slice(0, CALL_WIDTH - 1) + "…" : source
}

function line(call: string, value: string): string {
  return `  ${renderCall(call).padEnd(CALL_WIDTH)}  ${ARROW}  ${value}`
}

function sectionHeader(title: string | null): string {
  const label = title ? ` ${title} ` : ""
  return `\n─── ${label}${"─".repeat(Math.max(0, 48 - label.length))}`
}

export function format(suite: MochiSuiteResult): string {
  const out: string[] = []

  for (const section of suite.sections) {
    out.push(sectionHeader(section.title))
    for (const result of section.results) {
      const { story } = result
      if (story.description) out.push(`\n  ${story.description}`)
      for (const call of story.calls) {
        out.push(line(call.source, renderValue(result)))
      }
    }
  }

  return out.join("\n")
}
