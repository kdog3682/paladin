// @paladin/scaffold/main.ts
import { watch } from "fs"
import { readFile } from "fs/promises"
import { join } from "path"
import { homedir } from "os"
import { scaffold } from "./scaffold"

const WATCH_DIR = join(homedir(), "scratch")

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`

function timestamp() {
    return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}


async function waitForStable(path: string, { interval = 50, timeout = 2000 } = {}) {
    let lastSize = -1
    const start = Date.now()
    while (Date.now() - start < timeout) {
        try {
            const s = await stat(path)
            if (s.size > 0 && s.size === lastSize) return
            lastSize = s.size
        } catch { }
        await Bun.sleep(interval)
    }
}


watch(WATCH_DIR, async (event, filename) => {
    if (event !== "rename" || !filename) return
    if (filename.endsWith(".crdownload")) return
    const filepath = join(WATCH_DIR, filename)
    await waitForStable(filepath)

    console.log('Processing:', filename)

    try {
        const raw = await readFile(filepath, "utf-8")
        const conversation = JSON.parse(raw)
        const artifacts = conversation.artifacts ?? []
        if (!artifacts.length) return
        const result = await scaffold(artifacts)
        const root = result.projectRoot
        const files = result.files.map((f: string) => `  ${f.replace(root + "/", "")}`).join("\n")
        console.log(`scaffolded → ${root}\n${files}`)
    }
    catch (e) {
        console.log('ERROR', e)
    }
})

console.log(`---\n${timestamp()}: WATCHING ${WATCH_DIR}\n---`)
