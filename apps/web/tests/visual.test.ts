import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"
import puppeteer from "puppeteer"

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(here, "..")
const repoRoot = resolve(webRoot, "../..")
const snapshotFile = resolve(webRoot, "tests/__snapshots__/app.test.tsx.snap")
const metaFile = resolve(webRoot, "tests/.visual-meta.json")
const screenshotsDir = resolve(webRoot, "tests/screenshots")
const shots = {
  initial: resolve(screenshotsDir, "view-initial.png"),
  one: resolve(screenshotsDir, "view-1.png"),
  two: resolve(screenshotsDir, "view-2.png"),
}

async function run(cmd: string, args: string[], cwd: string) {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit" })
    child.on("exit", (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${cmd} ${args.join(" ")} failed with code ${code}`))
    })
    child.on("error", reject)
  })
}

async function waitForServer(url: string, timeoutMs = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {}
    await Bun.sleep(250)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function sha256(path: string) {
  const content = await readFile(path)
  return createHash("sha256").update(content).digest("hex")
}

async function main() {
  await mkdir(screenshotsDir, { recursive: true })

  // Keep visual capture tied to App snapshot state.
  await run("bun", ["test", "apps/web/tests/app.test.tsx", "-u"], repoRoot)

  const snapshotHash = existsSync(snapshotFile)
    ? await sha256(snapshotFile)
    : createHash("sha256").update(await readFile(resolve(webRoot, "tests/app.test.tsx"))).digest("hex")

  const hasScreenshots = Object.values(shots).every((p) => existsSync(p))

  if (existsSync(metaFile) && hasScreenshots) {
    const meta = JSON.parse(await readFile(metaFile, "utf8")) as { snapshotHash?: string }
    if (meta.snapshotHash === snapshotHash) {
      console.log("Visual snapshots are up to date. Skipping new screenshots.")
      return
    }
  }

  await run("bun", ["run", "--filter", "@paladin/web", "build"], repoRoot)

  const server = spawn(
    "bun",
    ["run", "--filter", "@paladin/web", "preview", "--", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
    { cwd: repoRoot, stdio: "inherit" }
  )

  try {
    await waitForServer("http://127.0.0.1:4173")

    const browser = await puppeteer.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.setViewport({ width: 1440, height: 900 })
      await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle0" })
      await page.click("body")
      await Bun.sleep(200)

      await page.screenshot({ path: shots.initial, fullPage: true })

      await page.keyboard.press("1")
      await Bun.sleep(200)
      await page.screenshot({ path: shots.one, fullPage: true })

      await page.keyboard.press("2")
      await Bun.sleep(200)
      await page.screenshot({ path: shots.two, fullPage: true })
    } finally {
      await browser.close()
    }

    await writeFile(
      metaFile,
      JSON.stringify(
        {
          snapshotHash,
          updatedAt: new Date().toISOString(),
          screenshots: {
            initial: "tests/screenshots/view-initial.png",
            one: "tests/screenshots/view-1.png",
            two: "tests/screenshots/view-2.png",
          },
        },
        null,
        2
      ) + "\n"
    )

    console.log("Visual screenshots updated.")
  } finally {
    server.kill("SIGTERM")
    await Bun.sleep(200)
    if (!server.killed) {
      server.kill("SIGKILL")
    }
    await rm(resolve(repoRoot, "apps/web/dist"), { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
