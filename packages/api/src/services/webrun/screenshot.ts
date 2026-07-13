import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import type { Page } from 'puppeteer'
import { kebab } from './slug'

const DIR = join(homedir(), '.paladin', 'screenshots')
const ROOT = '[data-demo-root]'

// Screenshot only the demo root so the PNG stays tight around the component
// rather than capturing the whole viewport. Timestamp busts browser caching.
export async function shoot(page: Page, slug: string, desc: string) {
  await mkdir(DIR, { recursive: true })
  const name = `${slug}__${kebab(desc).slice(0, 60)}-${Date.now()}.png`
  const path = join(DIR, name)

  const el = await page.$(ROOT)
  if (el) await el.screenshot({ path })
  else await page.screenshot({ path })

  return path
}
