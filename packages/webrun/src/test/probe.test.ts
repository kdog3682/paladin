import { describe, expect, test } from "bun:test"
import { parseCombo } from "../probe/keys"
import { probe } from "../probe/run"

const page = (body: string) => `data:text/html,${encodeURIComponent(body)}`

// alt+f opens a "dialog" (adds #dlg), Escape removes it
const APP = page(`<input id="i"><script>
  addEventListener('keydown', e => {
    if (e.altKey && e.shiftKey && e.code === 'KeyF') document.body.insertAdjacentHTML('beforeend', '<div id="dlg">hi</div>')
    if (e.key === 'Escape') document.getElementById('dlg')?.remove()
  })
  document.getElementById('i').addEventListener('input', e => document.title = e.target.value)
</script>`)

describe("parseCombo", () => {
  test("modifiers and key", () => {
    expect(parseCombo("cmd+alt+shift+F")).toEqual({ modifiers: ["Meta", "Alt", "Shift"], key: "f" })
  })
  test("named keys and aliases", () => {
    expect(parseCombo("esc").key).toBe("Escape")
    expect(parseCombo("ctrl+Down")).toEqual({ modifiers: ["Control"], key: "ArrowDown" })
  })
  test("plus key", () => {
    expect(parseCombo("ctrl++")).toEqual({ modifiers: ["Control"], key: "+" })
  })
  test("rejects unknown modifiers", () => {
    expect(() => parseCombo("hyper+f")).toThrow(/unknown modifier/)
  })
})

describe("probe", () => {
  test("press then expect, chained", async () => {
    const r = await probe({
      url: APP,
      actions: [
        { keypress: "alt+shift+f" },
        { expect: "#dlg" },
        { keypress: "Escape" },
        { expect: "!#dlg" },
        { click: "#i" },
        { type: "typed" },
        { eval: "document.title" },
      ],
    })
    expect(r.ok).toBe(true)
    expect(r.actions.map((s) => s.status)).toEqual(Array(r.actions.length).fill("ok"))
    expect(r.actions.find((s) => s.label.startsWith("expect #dlg"))?.detail).toBe('×1 "hi"')
    expect(r.actions.at(-1)?.detail).toBe("typed")
  }, 30_000)

  test("a failed expect skips the remaining actions", async () => {
    const r = await probe({
      url: APP,
      timeout: 300,
      actions: [{ expect: "#missing" }, { keypress: "alt+shift+f" }],
    })
    expect(r.ok).toBe(false)
    expect(r.actions.map((s) => s.status)).toEqual(["fail", "skipped"])
    expect(r.actions[0].detail).toContain("not found")
  }, 30_000)

  test("errors are tagged with the action that caused them", async () => {
    const r = await probe({
      url: page(`<script>addEventListener('keydown', () => { throw new Error('boom') })</script>`),
      actions: [{ keypress: "a" }],
    })
    expect(r.errors.some((e) => e.startsWith("[action 1]") && e.includes("boom"))).toBe(true)
  }, 30_000)

  test("preview outlines the page and cuts long runs", async () => {
    const items = Array.from({ length: 10 }, (_, i) => `<li>item ${i}</li>`).join("")
    const r = await probe({
      url: page(`<main><h1>Title</h1><p>hello there</p><button>Save</button><input placeholder="name"><ul>${items}</ul><script>1</script></main>`),
      preview: true,
    })
    const text = r.preview?.join("\n") ?? ""
    expect(text).toContain('h1 "Title"')
    expect(text).toContain('button "Save"')
    expect(text).toContain('input[text] placeholder="name"')
    expect(text).toContain("more li")
    expect(text).not.toContain("script")
    expect(r.preview!.length).toBeLessThan(20)
  }, 30_000)
})
