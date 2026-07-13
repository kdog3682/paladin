import puppeteer from 'puppeteer'
import { ensureStatic } from './templates'
import { generateRoutes } from './generate'
import { extractActions } from './actions'
import { runCmd } from './cmd'
import { shoot } from './screenshot'
import { markBashPayload } from '@paladin/utils/markBashPayload'

const BASE = 'http://localhost:5173/web-demo-runner'
const VIEWPORT = { width: 1280, height: 800 }

export interface RanAction {
  cmd: string
  desc: string
  url: string
}

export interface DemoResult {
  file: string
  component: string
  actions: RanAction[]
}

export async function webrun(files: string[], packageRoot: string): Promise<DemoResult[]> {
  await ensureStatic(packageRoot)
  const routes = await generateRoutes(packageRoot, files)

  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()
  await page.setViewport(VIEWPORT)

  const results: DemoResult[] = []

  for (const route of routes) {
    const actions = await extractActions(route.file)
    await page.goto(`${BASE}/${route.slug}`, { waitUntil: 'networkidle0' })

    const ran: RanAction[] = []
    for (const action of actions) {
      await runCmd(page, action.cmd)
      await page.waitForNetworkIdle({ idleTime: 300 }).catch(() => {})
      const url = await shoot(page, route.slug, action.desc)
      ran.push({ cmd: action.cmd, desc: action.desc, url })
    }

    results.push({ file: route.file, component: route.component, actions: ran })
  }

  await browser.close()

  for (const result of results) markBashPayload(result)

  return results
}
