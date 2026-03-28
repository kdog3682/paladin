// @paladin/squire/src/shell/captured-reporter.ts

import type { SquireStatus } from "../core/status"
import type { IReporter } from "./reporter"

export type CapturedEntry = {
  kind: "info" | "success" | "warn" | "error" | "header" | "blank" | "line" | "table" | "selectable" | "status" | "prompt"
  msg?: string
  data?: Record<string, string>
  state?: SquireStatus
  items?: { label: string, detail?: string }[]
}

export class CapturedReporter implements IReporter {
  entries: CapturedEntry[] = []

  info(msg: string) { this.entries.push({ kind: "info", msg }) }
  success(msg: string) { this.entries.push({ kind: "success", msg }) }
  warn(msg: string) { this.entries.push({ kind: "warn", msg }) }
  error(msg: string) { this.entries.push({ kind: "error", msg }) }
  header(msg: string) { this.entries.push({ kind: "header", msg }) }
  blank() { this.entries.push({ kind: "blank" }) }
  line(msg: string) { this.entries.push({ kind: "line", msg }) }
  prompt() { this.entries.push({ kind: "prompt" }) }

  table(data: Record<string, string>) {
    this.entries.push({ kind: "table", data })
  }

  selectable(items: { label: string, detail?: string }[]) {
    this.entries.push({ kind: "selectable", items })
  }

  status(state: SquireStatus) {
    this.entries.push({ kind: "status", state })
  }

  clear() {
    this.entries = []
  }

  has(kind: CapturedEntry["kind"], match?: string): boolean {
    return this.entries.some(e =>
      e.kind === kind && (!match || e.msg?.includes(match))
    )
  }

  last(kind: CapturedEntry["kind"]): CapturedEntry | undefined {
    return [...this.entries].reverse().find(e => e.kind === kind)
  }
}
