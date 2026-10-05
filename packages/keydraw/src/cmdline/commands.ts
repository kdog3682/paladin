import { cycleLine } from "../input-mode/cycle"
import { idleCmd, type CmdState } from "../store/slices/ui"
import { S, useEditor } from "../store/useEditor"
import { cmdGhost } from "./complete"
import { execCmd } from "./exec"
import { parseCmd } from "./parse"

const HISTORY_CAP = 100

function patch(p: Partial<CmdState>) {
  useEditor.setState(s => ({ cmd: { ...s.cmd, ...p } }))
}

/* property-token lines preview live on the selection, exactly like Input mode */
function setLine(line: string, cycling = false, extra: Partial<CmdState> = {}) {
  patch({ line, cycling, histPos: null, ...extra })
  const p = parseCmd(line)
  S().preview(p.kind === "tokens" ? { type: "tokens", line: p.line } : null)
}

export function typeCmd(ch: string) {
  const { line, cycling } = S().cmd
  setLine(cycling && ch !== "," ? `${line} ${ch}` : line + ch)
}

function start() {
  useEditor.setState({ mode: "command", cmd: idleCmd })
}

function leave() {
  S().preview(null)
  useEditor.setState({ mode: "normal", cmd: idleCmd })
}

function commit() {
  const line = S().cmd.line.trim()
  S().preview(null)
  useEditor.setState(s => ({
    mode: "normal",
    cmd: idleCmd,
    cmdHistory: line ? [...s.cmdHistory.filter(h => h !== line), line].slice(-HISTORY_CAP) : s.cmdHistory,
  }))
  void execCmd(line)
}

function space(dir: 1 | -1) {
  const { line } = S().cmd
  const p = parseCmd(line)
  if (p.kind !== "tokens") return setLine(line.endsWith(" ") || !line ? line : line + " ")
  const next = cycleLine(line, dir)
  if (next === null) return setLine(line.endsWith(" ") || !line ? line : line + " ")
  setLine(next, true)
}

/* ↑ walks to older entries, ↓ to newer ones and finally back to the typed line */
function walkHistory(dir: -1 | 1) {
  const s = S()
  const h = s.cmdHistory
  let { histPos: pos, histDraft: draft } = s.cmd
  if (!h.length) return
  if (pos === null) {
    if (dir > 0) return
    draft = s.cmd.line
    pos = h.length
  }
  pos += dir
  if (pos < 0) pos = 0
  const restored = pos >= h.length
  const line = restored ? draft : h[pos]
  setLine(line, false, { histPos: restored ? null : pos, histDraft: draft })
  patch({ histPos: restored ? null : pos, histDraft: draft })
}

const deleteWord = (s: string) => s.replace(/\S*\s*$/, "")

export const cmdHandlers: Record<string, (count: number) => void> = {
  "mode.command": () => start(),
  "cmd.commit": () => commit(),
  "cmd.cancel": () => leave(),
  "cmd.backspace": () => setLine(S().cmd.line.slice(0, -1)),
  "cmd.deleteWord": () => setLine(deleteWord(S().cmd.line)),
  "cmd.space": () => space(1),
  "cmd.spaceBack": () => space(-1),
  "cmd.accept": () => {
    const g = cmdGhost(S().cmd.line)
    if (g) setLine(S().cmd.line + g)
  },
  "cmd.historyPrev": () => walkHistory(-1),
  "cmd.historyNext": () => walkHistory(1),
}
