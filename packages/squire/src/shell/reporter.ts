// @paladin/squire/src/shell/reporter.ts

import type { SquireStatus } from "../core/status"

type Color = "reset" | "bold" | "dim" | "green" | "yellow" | "red" | "cyan" | "magenta" | "blue"

const codes: Record<Color, number> = {
  reset: 0,
  bold: 1,
  dim: 2,
  green: 32,
  yellow: 33,
  red: 31,
  cyan: 36,
  magenta: 35,
  blue: 34,
}

function c(color: Color, text: string): string {
  return `\x1b[${codes[color]}m${text}\x1b[${codes.reset}m`
}

function write(text: string) {
  process.stdout.write(text + "\n")
}

export interface IReporter {
  info(msg: string): void
  success(msg: string): void
  warn(msg: string): void
  error(msg: string): void
  header(msg: string): void
  blank(): void
  line(msg: string): void
  table(data: Record<string, string>): void
  selectable(items: { label: string, detail?: string }[]): void
  status(state: SquireStatus): void
  prompt(): void
}

export class Reporter implements IReporter {
  info(msg: string) {
    write(`${c("cyan", "ℹ")} ${msg}`)
  }

  success(msg: string) {
    write(`${c("green", "✓")} ${msg}`)
  }

  warn(msg: string) {
    write(`${c("yellow", "⚠")} ${msg}`)
  }

  error(msg: string) {
    write(`${c("red", "✗")} ${msg}`)
  }

  header(msg: string) {
    write(`\n${c("bold", c("magenta", `◆ ${msg}`))}`)
  }

  blank() {
    write("")
  }

  line(msg: string) {
    write(`  ${msg}`)
  }

  table(data: Record<string, string>) {
    const maxKey = Math.max(...Object.keys(data).map(k => k.length))
    for (const [k, v] of Object.entries(data)) {
      write(`  ${c("dim", k.padEnd(maxKey))}  ${v}`)
    }
  }

  selectable(items: { label: string, detail?: string }[]) {
    const letters = "abcdefghijklmnopqrstuvwxyz"
    for (let i = 0; i < items.length && i < letters.length; i++) {
      const key = c("cyan", letters[i])
      const label = items[i].label
      const detail = items[i].detail ? c("dim", ` ${items[i].detail}`) : ""
      write(`  ${key}  ${label}${detail}`)
    }
  }

  status(state: SquireStatus) {
    this.header(`squire — ${state.pkg}`)
    this.table({
      "package": state.pkg,
      "directory": state.pkgDir,
      "version": `v${state.latestVersion}`,
      "demo": state.watchState.demo ? c("green", "on") : "off",
      "test": state.watchState.test
        ? `${c("green", "on")}${state.watchState.testPattern ? ` (${state.watchState.testPattern})` : ""}`
        : "off",
      "dirty": state.dirtyFiles.length > 0
        ? c("yellow", `${state.dirtyFiles.length} files`)
        : c("green", "clean"),
    })
    if (state.dirtyFiles.length > 0) {
      this.blank()
      for (const f of state.dirtyFiles) {
        write(`    ${c("dim", "→")} ${f}`)
      }
    }
    this.blank()
  }

  prompt() {
    process.stdout.write(`${c("magenta", "❯")} `)
  }
}
