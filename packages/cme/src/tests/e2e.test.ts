// @paladin/cme/tests/e2e.test.ts
import { describe, it, beforeAll, afterAll } from 'bun:test'
import puppeteer, { Browser, Page } from 'puppeteer'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import { createServer, type ViteDevServer } from 'vite'

const SNAPSHOTS_DIR = join(import.meta.dir, '__snapshots__')
const PORT = 5199
const BASE_URL = `http://localhost:${PORT}`
const DELAY = 50

let browser: Browser
let page: Page
let server: ViteDevServer
let stepCounter = 0

async function snap(label: string) {
  stepCounter++
  const filename = `${String(stepCounter).padStart(3, '0')}_${label}.png`
  const editor = await page.$('.cm-editor')
  if (editor) {
    await editor.screenshot({
      path: join(SNAPSHOTS_DIR, filename),
    })
  } else {
    await page.screenshot({
      path: join(SNAPSHOTS_DIR, filename),
      fullPage: false,
    })
  }
}

async function focusEditor() {
  await page.click('.cm-content')
  await page.waitForSelector('.cm-focused')
}

async function selectAll() {
  const isMac = process.platform === 'darwin'
  const mod = isMac ? 'Meta' : 'Control'
  await page.keyboard.down(mod)
  await page.keyboard.press('a')
  await page.keyboard.up(mod)
}

async function clearEditor() {
  await focusEditor()
  await selectAll()
  await page.keyboard.press('Backspace')
}

async function getEditorContent(): Promise<string> {
  await focusEditor()
  await selectAll()

  // read selection via clipboard
  const content = await page.evaluate(async () => {
    // use the selection API to get selected text
    const sel = window.getSelection()
    return sel?.toString() ?? ''
  })

  // deselect by pressing right arrow (moves to end, collapses selection)
  await page.keyboard.press('End')
  return content
}

async function typeAndSnap(input: string, label: string) {
  await snap(`before_${label}`)
  for (const ch of input) {
    if (ch === '\n') {
      await page.keyboard.press('Enter')
    } else {
      await page.keyboard.type(ch, { delay: DELAY })
    }
  }
  await snap(`after_${label}`)
}

async function pressAndSnap(key: string, label: string) {
  await snap(`before_${label}`)
  await page.keyboard.press(key)
  await snap(`after_${label}`)
}

describe('e2e editor', () => {
  beforeAll(async () => {
    await mkdir(SNAPSHOTS_DIR, { recursive: true })
    server = await createServer({
      root: join(import.meta.dir, '../..'),
      server: { port: PORT },
    })
    await server.listen()

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    page = await browser.newPage()
    await page.setViewport({ width: 800, height: 600 })

    // grant clipboard permissions
    const context = browser.defaultBrowserContext()
    await context.overridePermissions(BASE_URL, ['clipboard-read', 'clipboard-write'])
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' })
    await page.waitForSelector('.cm-editor')

    // constrain editor size for smaller snapshots
    await page.addStyleTag({
      content: `
        .cm-editor { max-width: 480px; }
        .cm-scroller { min-height: 120px; max-height: 240px; }
      `,
    })

    stepCounter = 0
  })

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  describe('semicolon to colon', () => {
    it('converts ; to : while typing yaml', async () => {
      await clearEditor()
      await focusEditor()
      await typeAndSnap('name', 'semicolon_before_press')
      await typeAndSnap(';', 'semicolon_pressed')
      await typeAndSnap(' hello', 'semicolon_value')

      const content = await getEditorContent()
      if (!content.includes('name: hello')) {
        throw new Error(`Expected "name: hello", got ${JSON.stringify(content)}`)
      }
    })

    it('converts multiple semicolons', async () => {
      await clearEditor()
      await focusEditor()
      await typeAndSnap('a;; b', 'double_semicolon')

      const content = await getEditorContent()
      if (!content.includes('a:: b')) {
        throw new Error(`Expected "a:: b", got ${JSON.stringify(content)}`)
      }
    })
  })

  describe('smart enter — bullets', () => {
    it('continues - bullet on enter', async () => {
      await clearEditor()
      await focusEditor()
      await typeAndSnap('- first item', 'bullet_first')
      await pressAndSnap('Enter', 'bullet_enter')
      await typeAndSnap('second item', 'bullet_second')
      await snap('bullet_result')

      const content = await getEditorContent()
      if (!content.includes('- first item\n- second item')) {
        throw new Error(`Bullet continuation failed: ${JSON.stringify(content)}`)
      }
    })

    it('continues * bullet', async () => {
      await clearEditor()
      await focusEditor()
      await typeAndSnap('* alpha', 'star_bullet_first')
      await pressAndSnap('Enter', 'star_bullet_enter')
      await typeAndSnap('beta', 'star_bullet_second')

      const content = await getEditorContent()
      if (!content.includes('* alpha\n* beta')) {
        throw new Error(`Star bullet failed: ${JSON.stringify(content)}`)
      }
    })

    it('exits bullet on empty enter', async () => {
      await clearEditor()
      await focusEditor()
      await page.keyboard.type('- hello', { delay: DELAY })
      await page.keyboard.press('Enter')
      // now we have "- hello\n- " — press enter again to exit
      await snap('bullet_exit_before')
      await page.keyboard.press('Enter')
      await snap('bullet_exit_after')
      await page.keyboard.type('no bullet', { delay: DELAY })
      await snap('bullet_exit_result')

      const content = await getEditorContent()
      if (content.includes('- no bullet')) {
        throw new Error(`Should have exited bullet: ${JSON.stringify(content)}`)
      }
    })
  })

  describe('smart enter — numbered lists', () => {
    it('continues 1. 2. 3.', async () => {
      await clearEditor()
      await focusEditor()
      await typeAndSnap('1. first', 'num_dot_1')
      await pressAndSnap('Enter', 'num_dot_enter_1')
      await typeAndSnap('second', 'num_dot_2')
      await pressAndSnap('Enter', 'num_dot_enter_2')
      await typeAndSnap('third', 'num_dot_3')
      await snap('num_dot_result')

      const content = await getEditorContent()
      if (!content.includes('1. first\n2. second\n3. third')) {
        throw new Error(`Numbered list failed: ${JSON.stringify(content)}`)
      }
    })

    it('continues 1) 2) 3)', async () => {
      await clearEditor()
      await focusEditor()
      await typeAndSnap('1) alpha', 'num_paren_1')
      await pressAndSnap('Enter', 'num_paren_enter')
      await typeAndSnap('beta', 'num_paren_2')

      const content = await getEditorContent()
      if (!content.includes('1) alpha\n2) beta')) {
        throw new Error(`Numbered paren failed: ${JSON.stringify(content)}`)
      }
    })
  })

  describe('smart enter — lettered lists', () => {
    it('continues a) b) c)', async () => {
      await clearEditor()
      await focusEditor()
      await typeAndSnap('a) first', 'letter_paren_1')
      await pressAndSnap('Enter', 'letter_paren_enter_1')
      await typeAndSnap('second', 'letter_paren_2')
      await pressAndSnap('Enter', 'letter_paren_enter_2')
      await typeAndSnap('third', 'letter_paren_3')
      await snap('letter_paren_result')

      const content = await getEditorContent()
      if (!content.includes('a) first\nb) second\nc) third')) {
        throw new Error(`Lettered list failed: ${JSON.stringify(content)}`)
      }
    })
  })

  describe('smart enter — bracketed lists', () => {
    it('continues [1] [2] [3]', async () => {
      await clearEditor()
      await focusEditor()
      await typeAndSnap('[1] ref one', 'bracket_num_1')
      await pressAndSnap('Enter', 'bracket_num_enter')
      await typeAndSnap('ref two', 'bracket_num_2')

      const content = await getEditorContent()
      if (!content.includes('[1] ref one\n[2] ref two')) {
        throw new Error(`Bracketed number failed: ${JSON.stringify(content)}`)
      }
    })

    it('continues [a] [b] [c]', async () => {
      await clearEditor()
      await focusEditor()
      await typeAndSnap('[a] note', 'bracket_letter_1')
      await pressAndSnap('Enter', 'bracket_letter_enter')
      await typeAndSnap('another', 'bracket_letter_2')

      const content = await getEditorContent()
      if (!content.includes('[a] note\n[b] another')) {
        throw new Error(`Bracketed letter failed: ${JSON.stringify(content)}`)
      }
    })
  })

  describe('smart enter — roman numerals', () => {
    it('continues i) ii) iii) iv) v) vi)', async () => {
      await clearEditor()
      await focusEditor()

      const items = ['one', 'two', 'three', 'four', 'five', 'six']
      await page.keyboard.type('i) one', { delay: DELAY })
      await snap('roman_1')

      for (let idx = 1; idx < items.length; idx++) {
        await page.keyboard.press('Enter')
        await page.keyboard.type(items[idx], { delay: DELAY })
        await snap(`roman_${idx + 1}`)
      }

      const content = await getEditorContent()
      const expected = ['i) one', 'ii) two', 'iii) three', 'iv) four', 'v) five', 'vi) six']
      for (const line of expected) {
        if (!content.includes(line)) {
          throw new Error(`Roman numeral missing "${line}" in: ${JSON.stringify(content)}`)
        }
      }
    })
  })

  describe('smart enter — comments', () => {
    it('continues # comments', async () => {
      await clearEditor()
      await focusEditor()
      await typeAndSnap('# todo', 'hash_comment_1')
      await pressAndSnap('Enter', 'hash_comment_enter')
      await typeAndSnap('fix bugs', 'hash_comment_2')

      const content = await getEditorContent()
      if (!content.includes('# todo\n# fix bugs')) {
        throw new Error(`Hash comment failed: ${JSON.stringify(content)}`)
      }
    })
  })

  describe('qw — newline-tab-enter', () => {
    it('indents from unindented line', async () => {
      await clearEditor()
      await focusEditor()
      await typeAndSnap('parent', 'qw_parent')
      // type q then w quickly
      await page.keyboard.type('qw', { delay: 10 })
      await snap('qw_after_indent')
      await page.keyboard.type('child', { delay: DELAY })
      await snap('qw_child_typed')

      const content = await getEditorContent()
      if (!content.includes('parent\n  child')) {
        throw new Error(`qw indent failed: ${JSON.stringify(content)}`)
      }
    })

    it('double indents from indented line', async () => {
      await clearEditor()
      await focusEditor()
      await page.keyboard.type('root', { delay: DELAY })
      await page.keyboard.type('qw', { delay: 10 })
      await page.keyboard.type('level1', { delay: DELAY })
      await page.keyboard.type('qw', { delay: 10 })
      await snap('qw_double_indent')
      await page.keyboard.type('level2', { delay: DELAY })
      await snap('qw_double_indent_typed')

      const content = await getEditorContent()
      if (!content.includes('root\n  level1\n    level2')) {
        throw new Error(`qw double indent failed: ${JSON.stringify(content)}`)
      }
    })
  })

  describe('qe — newline-tab-exit', () => {
    it('dedents from indented line', async () => {
      await clearEditor()
      await focusEditor()
      await page.keyboard.type('root', { delay: DELAY })
      await page.keyboard.type('qw', { delay: 10 })
      await page.keyboard.type('nested', { delay: DELAY })
      await snap('qe_before_dedent')
      await page.keyboard.type('qe', { delay: 10 })
      await snap('qe_after_dedent')
      await page.keyboard.type('back', { delay: DELAY })
      await snap('qe_back_typed')

      const content = await getEditorContent()
      if (!content.includes('root\n  nested\nback')) {
        throw new Error(`qe dedent failed: ${JSON.stringify(content)}`)
      }
    })
  })

  describe('qw + qe yaml workflow', () => {
    it('builds a nested yaml structure', async () => {
      await clearEditor()
      await focusEditor()

      await page.keyboard.type('server', { delay: DELAY })
      await page.keyboard.type(';', { delay: DELAY }) // becomes :
      await snap('yaml_wf_server')

      await page.keyboard.type('qw', { delay: 10 })
      await page.keyboard.type('host', { delay: DELAY })
      await page.keyboard.type('; localhost', { delay: DELAY })
      await snap('yaml_wf_host')

      await page.keyboard.press('Enter')
      await page.keyboard.type('port', { delay: DELAY })
      await page.keyboard.type('; 8080', { delay: DELAY })
      await snap('yaml_wf_port')

      await page.keyboard.type('qe', { delay: 10 })
      await page.keyboard.type('database', { delay: DELAY })
      await page.keyboard.type(';', { delay: DELAY })
      await snap('yaml_wf_database')

      await page.keyboard.type('qw', { delay: 10 })
      await page.keyboard.type('name', { delay: DELAY })
      await page.keyboard.type('; mydb', { delay: DELAY })
      await snap('yaml_wf_final')

      const content = await getEditorContent()
      const expected = 'server:\n  host: localhost\n  port: 8080\ndatabase:\n  name: mydb'
      if (content !== expected) {
        throw new Error(`YAML workflow:\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(content)}`)
      }
    })
  })

  describe('backslash continuation', () => {
    it('continues indented under bullet', async () => {
      await clearEditor()
      await focusEditor()
      await typeAndSnap('- long item', 'backslash_before')
      await page.keyboard.press('\\')
      await snap('backslash_after_newline')
      await page.keyboard.type('continued here', { delay: DELAY })
      await snap('backslash_continued')

      const content = await getEditorContent()
      if (!content.includes('- long item\n  continued here')) {
        throw new Error(`Backslash continuation failed: ${JSON.stringify(content)}`)
      }
    })

    it('inserts literal backslash outside list', async () => {
      await clearEditor()
      await focusEditor()
      await page.keyboard.type('path', { delay: DELAY })
      await snap('backslash_literal_before')
      await page.keyboard.press('\\')
      await snap('backslash_literal_after')

      const content = await getEditorContent()
      if (!content.includes('path\\')) {
        throw new Error(`Literal backslash failed: ${JSON.stringify(content)}`)
      }
    })
  })

  describe('slash autocomplete', () => {
    it('opens autocomplete menu on /', async () => {
      await clearEditor()
      await focusEditor()
      await page.keyboard.type('configuration deployment orchestration', { delay: DELAY })
      await page.keyboard.press('Enter')
      await snap('autocomplete_before_slash')
      await page.keyboard.press('/')
      await Bun.sleep(200) // wait for autocomplete to render
      await snap('autocomplete_menu_open')

      // check that autocomplete tooltip appeared
      const hasTooltip = await page.evaluate(() => {
        return !!document.querySelector('.cm-tooltip-autocomplete')
      })
      if (!hasTooltip) {
        throw new Error('Autocomplete menu did not open')
      }

      // press escape to dismiss
      await page.keyboard.press('Escape')
      await snap('autocomplete_dismissed')
    })
  })

  describe('smart braces', () => {
    it('auto-closes brackets and quotes', async () => {
      await clearEditor()
      await focusEditor()

      await page.keyboard.type('key', { delay: DELAY })
      await page.keyboard.type(';', { delay: DELAY })
      await page.keyboard.type(' ', { delay: DELAY })
      await snap('braces_before_bracket')

      await page.keyboard.type('[', { delay: DELAY })
      await snap('braces_after_open_bracket')

      await page.keyboard.type('"', { delay: DELAY })
      await snap('braces_after_quote')

      await page.keyboard.type('hello', { delay: DELAY })
      await snap('braces_typed_inside')

      // the doc should have auto-closed brackets
      const content = await getEditorContent()
      if (!content.includes('["hello')) {
        throw new Error(`Auto-close failed: ${JSON.stringify(content)}`)
      }
    })
  })

  describe('copy and clear buttons', () => {
    it('clear button empties the editor', async () => {
      await clearEditor()
      await focusEditor()
      await page.keyboard.type('some content here', { delay: DELAY })
      await snap('clear_before')

      // find and click the Clear button (not Copy & Clear)
      const buttons = await page.$$('button')
      for (const btn of buttons) {
        const text = await btn.evaluate(el => el.textContent?.trim())
        if (text === 'Clear') {
          await btn.click()
          break
        }
      }
      await snap('clear_after')

      const content = await getEditorContent()
      if (content !== '') {
        throw new Error(`Clear failed, content: ${JSON.stringify(content)}`)
      }
    })
  })

  describe('indented smart enter', () => {
    it('preserves indentation on nested bullets', async () => {
      await clearEditor()
      await focusEditor()

      await page.keyboard.type('- top', { delay: DELAY })
      await page.keyboard.type('qw', { delay: 10 })
      await page.keyboard.type('- nested one', { delay: DELAY })
      await snap('nested_bullet_1')
      await page.keyboard.press('Enter')
      await page.keyboard.type('nested two', { delay: DELAY })
      await snap('nested_bullet_2')

      const content = await getEditorContent()
      if (!content.includes('  - nested one\n  - nested two')) {
        throw new Error(`Nested bullet failed: ${JSON.stringify(content)}`)
      }
    })
  })
})
