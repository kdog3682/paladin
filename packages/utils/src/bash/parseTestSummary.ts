export interface TestFailure {
  path: string
  statement: string
  expected: string
  received: string
  context: string
}

export interface TestSummary {
  pass: string[]
  failures: TestFailure[]
  desc: string
}

// OSC (hyperlinks), CSI (colour, erase, cursor moves), and two-char escapes
const ESCAPES = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -\/]*[@-~]|\x1b[@-Z\\-_]/g

const RAN = /^\s*Ran\s+(\d+)\s+tests?\s+across\s+\d+\s+files?\./

const COUNT = /^\s*(\d+)\s+(pass|fail|skip|todo)\s*$/

const NOISE = /expect\(\)\s+calls|filtered out|^\s*Ran\s/

// a bare source path used as a section header: `src/fs/readJson.test.ts:`
const FILE_HEADER = /^([^\s:]+\.[cm]?[jt]sx?):\s*$/

const PASS_LINE = /^\s*(?:\(pass\)|[\u2713\u2714])\s+(.+)$/

const FAIL_LINE = /^\s*(?:\(fail\)|[\u2717\u2718\u00d7])\s+(.+)$/

const ANY_MARKER = /^\s*(?:\((?:pass|fail|skip|todo)\)|[\u2713\u2714\u2717\u2718\u00d7])\s+/

const DURATION = /\s*\[\s*[\d.]+\s*(?:ms|s|m)\s*\]\s*$/

const LABEL = /^\s*(Expected|Received):\s?(.*)$/

const STACK_PATH = /\(([^\s()]+\.[cm]?[jt]sx?):\d+:\d+\)/

const SCAN_WINDOW = 12

/**
 * Scrape a `bun test` run into passing statements and structured failures.
 *
 * Input is stripped of ANSI colour, cursor/erase sequences, OSC hyperlinks
 * and carriage-return overwrites first, so every string is plain text.
 * Failure bodies are split into the expected value, the received value and
 * everything else (codeframe, error line, stack) as `context`. Returns null
 * when the output holds no recognisable summary, so callers can degrade the
 * title to a bare `bun test`.
 */
export function parseTestSummary(stderr: string): TestSummary | null {
  if (!stderr) return null

  const lines = clean(stderr)

  let ranAt = -1
  let ranTotal = -1

  for (let i = lines.length - 1; i >= 0; i--) {
    const m = RAN.exec(lines[i])
    if (!m) continue
    ranAt = i
    ranTotal = Number(m[1])
    break
  }

  const summaryAt = ranAt === -1 ? lines.length : ranAt
  const block = collectCounts(lines, summaryAt - 1)
  if (!block && ranAt === -1) return null

  const end = block ? block.start : summaryAt
  const pass = collectPasses(lines, end)
  const failures = collectFailures(lines, end)

  const counts = block?.counts ?? {}
  const passed = counts.pass ?? pass.length
  const failed = counts.fail ?? failures.length
  const total = ranTotal >= 0 ? ranTotal : passed + failed + (counts.skip ?? 0) + (counts.todo ?? 0)

  return { pass, failures, desc: describe(passed, failed, total) }
}

function clean(stderr: string): string[] {
  return stderr
    .replace(ESCAPES, '')
    .split(/\r?\n/)
    .map((line) => line.split('\r').pop()!.trimEnd())
}

interface CountBlock {
  counts: Record<string, number>
  start: number
}

function collectCounts(lines: string[], from: number): CountBlock | null {
  const counts: Record<string, number> = {}
  let seen = false
  let start = from + 1

  for (let i = from, scanned = 0; i >= 0 && scanned < SCAN_WINDOW; i--, scanned++) {
    const line = lines[i]

    if (!line.trim()) {
      if (seen) break
      continue
    }

    const count = COUNT.exec(line)
    if (count) {
      seen = true
      start = i
      counts[count[2]] = Number(count[1])
      continue
    }

    if (NOISE.test(line)) {
      if (!seen) start = i
      continue
    }

    if (seen) break
  }

  return seen ? { counts, start } : null
}

function collectPasses(lines: string[], end: number): string[] {
  const out: string[] = []

  for (let i = 0; i < end; i++) {
    const m = PASS_LINE.exec(lines[i])
    if (m) out.push(statement(m[1]))
  }

  return out
}

function collectFailures(lines: string[], end: number): TestFailure[] {
  const out: TestFailure[] = []
  let file = ''

  for (let i = 0; i < end; i++) {
    const header = FILE_HEADER.exec(lines[i])
    if (header) {
      file = header[1]
      continue
    }

    const fail = FAIL_LINE.exec(lines[i])
    if (!fail) continue

    const { body, next } = readBody(lines, i + 1, end)
    const { expected, received, context } = split(body)

    out.push({
      path: file || pathFromContext(context),
      statement: statement(fail[1]),
      expected,
      received,
      context,
    })

    i = next - 1
  }

  return out
}

function readBody(lines: string[], from: number, end: number): { body: string[]; next: number } {
  const body: string[] = []
  let i = from

  for (; i < end; i++) {
    if (ANY_MARKER.test(lines[i]) || FILE_HEADER.test(lines[i])) break
    body.push(lines[i])
  }

  return { body, next: i }
}

function split(body: string[]): { expected: string; received: string; context: string } {
  const expected: string[] = []
  const received: string[] = []
  const context: string[] = []
  let sink = context

  for (const line of body) {
    const label = LABEL.exec(line)

    if (label) {
      sink = label[1] === 'Expected' ? expected : received
      if (label[2]) sink.push(label[2])
      continue
    }

    if (sink !== context && !line.trim()) {
      sink = context
      continue
    }

    sink.push(line)
  }

  return {
    expected: join(expected),
    received: join(received),
    context: join(collapse(context)),
  }
}

function join(lines: string[]): string {
  const out = [...lines]
  while (out.length && !out[0].trim()) out.shift()
  while (out.length && !out[out.length - 1].trim()) out.pop()
  return out.join('\n')
}

function collapse(lines: string[]): string[] {
  return lines.filter((line, i) => line.trim() || lines[i - 1]?.trim())
}

function statement(raw: string): string {
  return raw.replace(DURATION, '').trim()
}

function pathFromContext(context: string): string {
  return STACK_PATH.exec(context)?.[1] ?? ''
}

function describe(pass: number, fail: number, total: number): string {
  return fail > 0 ? `${pass}/${total} pass, ${fail} fail` : `${total} pass`
}
