export const PREVIEW_MAX_LINES = 60

/**
 * runs in the page (serialized by puppeteer, so it must stay self-contained).
 * A compact outline of what is on screen: landmarks, headings, text, buttons, links, inputs.
 * Plain wrappers are flattened, runs of same-kind siblings are cut to 3, and the whole thing is capped at `max` lines.
 */
export const readOutline = (max: number): string[] => {
  const SKIP = new Set(["script", "style", "svg", "noscript", "template", "link", "meta", "head", "path"])
  const LEAF = new Set(["button", "a", "h1", "h2", "h3", "h4", "h5", "h6", "label", "option", "summary", "th", "td"])
  const FIELD = new Set(["input", "select", "textarea"])
  const BOX = new Set(["dialog", "nav", "main", "header", "footer", "aside", "form", "ul", "ol", "table", "section"])
  const RUN = 3
  const DEPTH = 8

  const clip = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n)}…` : s)
  const squash = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim()

  type Row = { depth: number; kind: string; text: string }
  const rows: Row[] = []

  const visible = (el: Element) => {
    const s = getComputedStyle(el)
    return s.display !== "none" && s.visibility !== "hidden"
  }

  const describe = (el: Element, tag: string) => {
    const role = el.getAttribute("role")
    const id = el.id ? `#${el.id}` : ""
    const name = el.getAttribute("aria-label")
    let head = role && role !== tag ? `${tag}[role=${role}]` : tag
    if (tag === "input") head = `input[${el.getAttribute("type") ?? "text"}]`
    const extra: string[] = []
    if (name) extra.push(`aria-label="${clip(name)}"`)
    if (tag === "input" || tag === "textarea") {
      const el2 = el as HTMLInputElement
      if (el2.placeholder) extra.push(`placeholder="${clip(el2.placeholder)}"`)
      if (el2.value) extra.push(`value="${clip(el2.value)}"`)
    }
    if (tag === "a" && el.getAttribute("href")) extra.push(`→ ${clip(el.getAttribute("href")!, 30)}`)
    if ((el as HTMLButtonElement).disabled) extra.push("disabled")
    return { head: head + id, extra }
  }

  const walk = (el: Element, depth: number) => {
    const tag = el.tagName.toLowerCase()
    if (SKIP.has(tag) || !visible(el)) return
    const role = el.getAttribute("role")
    const editable = el.getAttribute("contenteditable") === "true" || role === "textbox"

    if (FIELD.has(tag) || editable) {
      if ((el as HTMLInputElement).type === "hidden") return
      const { head, extra } = describe(el, tag)
      rows.push({ depth, kind: head.replace(/#.*/, ""), text: [head, ...extra].join(" ") })
      return
    }
    if (LEAF.has(tag) || role === "button" || role === "tab" || role === "menuitem") {
      const { head, extra } = describe(el, tag)
      const text = clip(squash(el.textContent))
      rows.push({ depth, kind: head.replace(/#.*/, ""), text: [head, text && `"${text}"`, ...extra].filter(Boolean).join(" ") })
      return
    }
    if (tag === "img") {
      const alt = el.getAttribute("alt")
      rows.push({ depth, kind: "img", text: `img${alt ? ` "${clip(alt)}"` : ""}` })
      return
    }

    const boxed = BOX.has(tag) || (role && role !== "presentation" && role !== "none") || el.hasAttribute("aria-label")
    let d = depth
    if (boxed && depth < DEPTH) {
      const { head, extra } = describe(el, tag)
      rows.push({ depth, kind: head.replace(/#.*/, ""), text: [head, ...extra].join(" ") })
      d = depth + 1
    }

    // text that belongs to this element itself, not to its children
    const own = squash(
      [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join(" "),
    )
    if (own) {
      const kind = tag === "li" || tag === "p" ? tag : "text"
      rows.push({ depth: d, kind, text: `${kind === "text" ? "" : `${kind} `}"${clip(own, 60)}"` })
    }

    for (const child of el.children) walk(child, d)
  }

  if (document.body) walk(document.body, 0)

  // cut runs of same-kind siblings: keep the first few, count the rest
  const out: string[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    let j = i
    while (j + 1 < rows.length && rows[j + 1].depth === r.depth && rows[j + 1].kind === r.kind) j++
    const n = j - i + 1
    const shown = Math.min(n, RUN)
    for (let k = 0; k < shown; k++) out.push(`${"  ".repeat(r.depth)}${rows[i + k].text}`)
    if (shown < n) out.push(`${"  ".repeat(r.depth)}… ${n - shown} more ${r.kind}`)
    i = j
  }

  return out.length > max ? [...out.slice(0, max), `… ${out.length - max} more lines`] : out
}
