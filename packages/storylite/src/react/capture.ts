// @paladin/storylite/src/react/capture.ts

import puppeteer, { type Browser, type Page } from "puppeteer"
import { mkdir, writeFile } from "fs/promises"
import { join, dirname } from "path"
import type { StoryModule } from "./types"

export type CaptureMap = Map<string, Map<string, string>>
// file -> exportName -> imagePath

export type CaptureOpts = {
  outDir: string
  viewport: { width: number, height: number }
  timeout: number
}

export async function capture(
  baseUrl: string,
  storyModules: StoryModule[],
  opts: CaptureOpts
): Promise<CaptureMap> {
  const results: CaptureMap = new Map()
  let browser: Browser | null = null

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    })

    const page = await browser.newPage()
    await page.setViewport(opts.viewport)

    for (let i = 0; i < storyModules.length; i++) {
      const mod = storyModules[i]
      const fileMap = new Map<string, string>()

      for (const story of mod.stories) {
        const url = `${baseUrl}/__storylite/${i}/${story.exportName}`
        const imagePath = buildImagePath(opts.outDir, mod.filePath, story.exportName)

        await ensureDir(dirname(imagePath))
        await navigateAndCapture(page, url, imagePath, opts.timeout)

        fileMap.set(story.exportName, imagePath)
      }

      results.set(mod.filePath, fileMap)
    }

    return results
  } finally {
    if (browser) await browser.close()
  }
}

async function navigateAndCapture(
  page: Page,
  url: string,
  imagePath: string,
  timeout: number
): Promise<void> {
  await page.goto(url, { waitUntil: "networkidle0", timeout })

  await page.waitForSelector("[data-storylite-ready]", { timeout })

  const root = await page.$("[data-storylite-root]")
  if (!root) {
    throw new Error(`No [data-storylite-root] found at ${url}`)
  }

  const screenshot = await root.screenshot({ type: "png" })
  await writeFile(imagePath, screenshot)
}

function buildImagePath(outDir: string, filePath: string, exportName: string): string {
  const sanitized = filePath
    .replace(/^\.\//, "")
    .replace(/\.(story|stories)\.(tsx?|jsx?)$/, "")
    .replace(/[/\\]/g, "-")

  return join(outDir, `${sanitized}--${exportName}.png`)
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}
