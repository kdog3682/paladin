// @paladin/web/e2e/appshell.demo.ts
import puppeteer from 'puppeteer'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { createServer } from 'vite'

const OUT = join(process.env.HOME!, '.tmp', 'paladin-e2e')
const PORT = 5188
const BASE = `http://localhost:${PORT}`

type Shot = { file: string, label: string }
const shots: Shot[] = []

async function snap(page: puppeteer.Page, label: string, selector?: string) {
  const name = `${String(shots.length).padStart(3, '0')}.png`
  const path = join(OUT, name)
  if (selector) {
    const el = await page.waitForSelector(selector)
    await el!.screenshot({ path })
  } else {
    await page.screenshot({ path })
  }
  shots.push({ file: name, label })
  console.log(`  📸 ${label}`)
}

async function buildReport() {
  const images = shots.map((s) =>
    `<div style="margin-bottom:2rem">
      <h3 style="font-family:system-ui;color:#333;margin-bottom:.5rem">${s.label}</h3>
      <img src="${s.file}" style="max-width:100%;border:1px solid #ddd;border-radius:6px" />
    </div>`
  ).join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Paladin E2E Report</title>
  <style>
    body { max-width: 960px; margin: 2rem auto; padding: 0 1rem; background: #fafafa; color: #222; font-family: system-ui, sans-serif; }
    h1 { border-bottom: 2px solid #e5e5e5; padding-bottom: .5rem; }
    h3 code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 0.85em; }
  </style>
</head>
<body>
  <h1>AppShell E2E Demo</h1>
  <p style="color:#666">${shots.length} screenshots captured</p>
  ${images}
</body>
</html>`

  const reportPath = join(OUT, 'report.html')
  await writeFile(reportPath, html)
  return reportPath
}

async function main() {
  await mkdir(OUT, { recursive: true })

  const vite = await createServer({ server: { port: PORT, strictPort: true } })
  await vite.listen()
  console.log(`Vite dev server running on ${BASE}`)

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })

  console.log(`Navigating to ${BASE}`)
  await page.goto(BASE, { waitUntil: 'networkidle0' })

  const TAB_BAR = 'header'
  const CONTENT = 'main'
  const MODAL = '[role="dialog"]'

  // 1 — initial state: tab 1 active
  await snap(page, 'Initial load — <code>SessionMonitor</code> active', TAB_BAR)

  // 2 — switch to FileViewer via keyboard
  await page.keyboard.press('2')
  await page.waitForSelector('text/FileViewer')
  await snap(page, 'Pressed <code>2</code> — switched to <code>FileViewer</code>', CONTENT)

  // 3 — switch to DocumentEditor
  await page.keyboard.press('3')
  await page.waitForSelector('text/DocumentEditor')
  await snap(page, 'Pressed <code>3</code> — switched to <code>DocumentEditor</code>', CONTENT)

  // 4 — switch to AppRunner
  await page.keyboard.press('4')
  await page.waitForSelector('text/AppRunner')
  await snap(page, 'Pressed <code>4</code> — switched to <code>AppRunner</code>', CONTENT)

  // 5 — back to SessionMonitor
  await page.keyboard.press('1')
  await page.waitForSelector('text/SessionMonitor')
  await snap(page, 'Pressed <code>1</code> — back to <code>SessionMonitor</code>', CONTENT)

  // 6 — open command line modal
  await page.keyboard.press(';')
  await page.waitForSelector('input[placeholder="Type a command…"]')
  await snap(page, 'Pressed <code>;</code> — command line modal opened', MODAL)

  // 7 — type partial command
  await page.keyboard.type('refresh')
  await new Promise((r) => setTimeout(r, 200))
  await snap(page, 'Typed <code>refresh</code> — filtered commands', MODAL)

  // 8 — clear with Escape (text present, should clear not close)
  await page.keyboard.press('Escape')
  await new Promise((r) => setTimeout(r, 100))
  await snap(page, 'Pressed <code>Esc</code> with text — input cleared, modal stays open', MODAL)

  // 9 — close modal with Escape (empty input)
  await page.keyboard.press('Escape')
  await new Promise((r) => setTimeout(r, 200))
  await snap(page, 'Pressed <code>Esc</code> on empty input — modal closed', CONTENT)

  // 10 — switch to DocumentEditor, open modal, run "Create nested document"
  await page.keyboard.press('3')
  await page.waitForSelector('text/DocumentEditor')
  await page.keyboard.press(';')
  await page.waitForSelector('input[placeholder="Type a command…"]')
  await page.keyboard.type('create')
  await new Promise((r) => setTimeout(r, 200))
  await snap(page, 'On <code>DocumentEditor</code> — searched <code>create</code>', MODAL)

  await page.keyboard.press('Enter')
  await new Promise((r) => setTimeout(r, 200))
  await snap(page, 'Selected <code>Create nested document</code> — awaiting <code>name</code> arg', MODAL)

  await page.keyboard.type('my-new-doc')
  await new Promise((r) => setTimeout(r, 100))
  await snap(page, 'Typed <code>my-new-doc</code> as document name', MODAL)

  await page.keyboard.press('Enter')
  await new Promise((r) => setTimeout(r, 200))
  await snap(page, 'Pressed <code>Enter</code> — command executed, modal closed', CONTENT)

  // 11 — switch to AppRunner, open modal, multi-arg "Pick items"
  await page.keyboard.press('4')
  await page.waitForSelector('text/AppRunner')
  await page.keyboard.press(';')
  await page.waitForSelector('input[placeholder="Type a command…"]')
  await page.keyboard.type('pick')
  await new Promise((r) => setTimeout(r, 200))
  await snap(page, 'On <code>AppRunner</code> — searched <code>pick</code>', MODAL)

  await page.keyboard.press('Enter')
  await new Promise((r) => setTimeout(r, 300))
  await snap(page, 'Selected <code>Pick items</code> — showing autocomplete for <code>item</code>', MODAL)

  await page.keyboard.type('dev')
  await new Promise((r) => setTimeout(r, 200))
  await snap(page, 'Typed <code>dev</code> — filtered to <code>dev-server</code>', MODAL)

  await page.keyboard.press('Enter')
  await new Promise((r) => setTimeout(r, 300))
  await snap(page, 'Selected <code>dev-server</code> — now showing <code>mode</code> options', MODAL)

  await page.keyboard.press('ArrowDown')
  await new Promise((r) => setTimeout(r, 100))
  await snap(page, 'Arrow down — highlighting <code>once</code>', MODAL)

  await page.keyboard.press('Enter')
  await new Promise((r) => setTimeout(r, 200))
  await snap(page, 'Selected <code>once</code> — both args collected, command executed', CONTENT)

  await browser.close()
  await vite.close()
  console.log(`\n✅ ${shots.length} screenshots saved to ${OUT}`)

  const reportPath = await buildReport()
  console.log(`📄 Report: ${reportPath}`)

  Bun.spawn(['python3', '-c', `import webbrowser; webbrowser.open('file://${reportPath}')`])
}

main().catch((err) => {
  console.error('E2E failed:', err)
  process.exit(1)
})
