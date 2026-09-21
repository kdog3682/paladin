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
  test("slash and minus press the main-row keys, not the numpad", () => {
    expect(parseCombo("ctrl+/")).toEqual({ modifiers: ["Control"], key: "Slash" })
    expect(parseCombo("ctrl+-").key).toBe("Minus")
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

  test("text reads every match", async () => {
    const r = await probe({
      url: page(`<ul><li>one</li><li> two   words </li></ul>`),
      actions: [{ text: "li" }, { text: "#missing" }],
    })
    expect(r.actions[0].detail).toBe("one | two words")
    expect(r.actions[1].status).toBe("fail")
    expect(r.actions[1].detail).toContain("matched nothing")
  }, 30_000)

  test("reload waits for the page to replace itself", async () => {
    // a real server: chrome refuses script navigations of a data: url. the first
    // response reloads itself after goto and its settle are done, so the reload
    // lands while the action waits; every later response is the "new" page
    let hits = 0
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => {
        hits++
        const body = hits === 1 ? "<h1>first</h1><script>setTimeout(() => location.reload(), 1800)</script>" : "<h1>second</h1>"
        return new Response(body, { headers: { "content-type": "text/html" } })
      },
    })
    try {
      const r = await probe({ url: server.url.href, actions: [{ reload: 5000 }, { text: "h1" }] })
      expect(r.ok).toBe(true)
      expect(r.actions[0].detail).toMatch(/^reloaded after \d+ms$/)
      expect(r.actions[1].detail).toBe("second")
    } finally {
      server.stop(true)
    }
  }, 30_000)

  test("reload fails when nothing reloads the page", async () => {
    const r = await probe({ url: page("<p>still</p>"), actions: [{ reload: 400 }, { text: "p" }] })
    expect(r.ok).toBe(false)
    expect(r.actions[0].detail).toContain("did not reload within 400ms")
    expect(r.actions[1].status).toBe("skipped")
  }, 30_000)
})
