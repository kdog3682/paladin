// @paladin/squire/src/shell/statusbar.ts

import type { AppState } from "../handler"

const WIDTH = 80
const CLEAR_LINE = "\x1b[2K"
const SAVE_CURSOR = "\x1b7"
const RESTORE_CURSOR = "\x1b8"
const MOVE_TO_TOP = "\x1b[1;1H"
const SCROLL_REGION = (start: number) => `\x1b[${start};r`
const INVERSE = "\x1b[7m"
const RESET = "\x1b[0m"
const DIM = "\x1b[2m"

export class StatusBar {
  private lastLine = ""

  render(state: AppState) {
    const pkg = state.pkg ?? "none"
    const dir = state.pkgDir ?? ""
    const short = dir.replace(/^.*\/packages\//, "")
    const left = ` ${pkg}`
    const right = `${short} `
    const gap = Math.max(1, WIDTH - left.length - right.length)
    const line = `${INVERSE}${left}${" ".repeat(gap)}${DIM}${right}${RESET}`

    if (line === this.lastLine) return
    this.lastLine = line

    process.stdout.write(
      `${SAVE_CURSOR}${MOVE_TO_TOP}${CLEAR_LINE}${line}${RESTORE_CURSOR}`
    )
  }

  init() {
    console.clear()
    process.stdout.write(SCROLL_REGION(2))
    process.stdout.write("\x1b[2;1H")
  }
}
