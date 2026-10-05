import { expect, test } from "bun:test"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import { run } from "./commands/dispatch"
import { execCmd } from "./cmdline/exec"
import { S } from "./store/useEditor"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function mount() {
  const el = document.createElement("div")
  document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => root.render(<App />))
  return { el, root }
}

test("App renders with every overlay and modal kind without throwing", async () => {
  const { el, root } = await mount()
  expect(el.querySelector("[data-board]")).toBeTruthy()
  const rootId = S().doc.boards[S().doc.currentBoard].root
  S().setFocus(rootId)
  for (const cmd of ["defaults rect", "defaults editor", "defaults shadows", "keys", "help"]) {
    await act(async () => void (await execCmd(cmd)))
    expect(S().modal.kind).not.toBeNull()
    await act(async () => run("modal.close", 1))
  }
  await act(async () => run("component.loader", 1))
  await act(async () => run("modal.text.cancel", 1))
  await act(async () => run("icon.picker", 1))
  expect(document.body.textContent).toContain("Icons")
  await act(async () => run("modal.text.cancel", 1))
  await act(async () => run("mode.command", 1))
  expect(document.body.textContent).toContain(":")
  await act(async () => run("cmd.cancel", 1))
  await act(async () => root.unmount())
})
