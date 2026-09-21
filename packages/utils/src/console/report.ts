export type ReportOpts = {
  /* spaces per indent level, default 2 */
  indent?: number
}

/* chainable builder for plain-text console reports */
export class ReportBuilder {
  private lines: string[] = []
  private depth = 0
  private readonly indentSize: number

  constructor(title?: string, opts: ReportOpts = {}) {
    this.indentSize = opts.indent ?? 2
    if (title) this.heading(title)
  }

  line(text = ""): this {
    const pad = " ".repeat(this.depth * this.indentSize)
    for (const part of text.split("\n")) this.lines.push(part ? pad + part : "")
    return this
  }

  blank(): this {
    if (this.lines.length && this.lines[this.lines.length - 1] !== "") this.lines.push("")
    return this
  }

  heading(text: string): this {
    this.blank()
    this.line(text)
    this.line("─".repeat(text.length))
    return this
  }

  /* titled block, body is indented */
  section(title: string, body?: (r: this) => void): this {
    this.line(title)
    if (body) this.indent(body)
    return this
  }

  indent(body: (r: this) => void): this {
    this.depth++
    try {
      body(this)
    } finally {
      this.depth--
    }
    return this
  }

  kv(key: string, value: unknown): this {
    return this.line(`${key}: ${String(value)}`)
  }

  /* aligned key / value rows */
  table(rows: [string, unknown][]): this {
    const width = Math.max(0, ...rows.map(([k]) => k.length))
    for (const [k, v] of rows) this.line(`${k.padEnd(width)}  ${String(v)}`)
    return this
  }

  list(items: unknown[], bullet = "-"): this {
    for (const item of items) this.line(`${bullet} ${String(item)}`)
    return this
  }

  ok(text: string): this {
    return this.line(`OK: ${text}`)
  }

  warn(text: string): this {
    return this.line(`WARN: ${text}`)
  }

  error(text: string): this {
    return this.line(`ERROR: ${text}`)
  }

  toString(): string {
    return this.lines.join("\n").replace(/^\n+|\n+$/g, "")
  }

  print(): this {
    console.log(this.toString())
    return this
  }
}
