import type { KeyInput, Page } from 'puppeteer'

const DEFAULT_SLEEP = 400
const STEP_SLEEP = 150
const TYPE_DELAY = 20

export type Token =
  | { kind: 'click'; selector: string }
  | { kind: 'key'; key: KeyInput; mods: KeyInput[] }
  | { kind: 'sleep'; ms: number }
  | { kind: 'type'; text: string }

const KEYS: Record<string, KeyInput> = {
  cr: 'Enter',
  enter: 'Enter',
  tab: 'Tab',
  esc: 'Escape',
  escape: 'Escape',
  space: 'Space',
  backspace: 'Backspace',
  delete: 'Delete',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
}

// `mod` is just ctrl.
const MODS: Record<string, KeyInput> = {
  mod: 'Control',
  ctrl: 'Control',
  control: 'Control',
  alt: 'Alt',
  opt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
  cmd: 'Meta',
}

// `<click .sel>const x = 42` -> [click .sel, type "const x = 42"]
// Anything outside <...> is literal text typed key-by-key.
export function tokenize(cmd: string): Token[] {
  const tokens: Token[] = []
  const re = /<([^>]*)>|([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(cmd))) {
    if (m[1] !== undefined) tokens.push(parseAngle(m[1].trim()))
    else if (m[2]) tokens.push({ kind: 'type', text: m[2] })
  }
  return tokens
}

function parseAngle(inner: string): Token {
  const head = inner.split(/\s+/)[0]
  const param = inner.slice(head.length).trim()
  if (head === 'click') return { kind: 'click', selector: param }
  if (head === 'sleep') return { kind: 'sleep', ms: param ? Number(param) : DEFAULT_SLEEP }
  return parseKey(head, inner)
}

// ctrl-f / ctrl-alt-f / shift-tab / mod-shift-p / a bare key like cr
function parseKey(head: string, inner: string): Token {
  const parts = head.toLowerCase().split('-').filter(Boolean)
  const mods: KeyInput[] = []

  while (parts.length > 1 && MODS[parts[0]]) {
    const mod = MODS[parts.shift()!]
    if (!mods.includes(mod)) mods.push(mod)
  }

  const last = parts.join('-')
  const key = KEYS[last] ?? (last.length === 1 ? (last as KeyInput) : null)
  if (!key) throw new Error(`webrun: unknown command <${inner}>`)

  return { kind: 'key', key, mods }
}

export async function runCmd(page: Page, cmd: string) {
  for (const token of tokenize(cmd)) {
    await runToken(page, token)
    await sleep(STEP_SLEEP)
  }
}

async function runToken(page: Page, token: Token) {
  switch (token.kind) {
    case 'click':
      await page.waitForSelector(token.selector, { timeout: 10_000 })
      await page.click(token.selector)
      return
    case 'key':
      for (const mod of token.mods) await page.keyboard.down(mod)
      try {
        await page.keyboard.press(token.key)
      } finally {
        for (const mod of [...token.mods].reverse()) await page.keyboard.up(mod)
      }
      return
    case 'sleep':
      await sleep(token.ms)
      return
    case 'type':
      await page.keyboard.type(token.text, { delay: TYPE_DELAY })
      return
  }
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
