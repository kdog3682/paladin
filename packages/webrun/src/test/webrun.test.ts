import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

/** shape of the json webrun caches between runs */
type State = {
  app: string
  pid: number
  port: number
  url: string
  workdir: string
  mode: "passthrough" | "virtual"
}

// webrun stores its state under XDG_CACHE_HOME, and it resolves that env var once
// at module load. so we point it at a throwaway dir BEFORE importing webrun —
// that's why the import below is a dynamic `await import` rather than a normal
// top-level one. without this the tests would stomp on the real ~/.cache state
// and kill whatever server you had running.
const cache = await mkdtemp(join(tmpdir(), "webrun-test-"))
process.env.XDG_CACHE_HOME = cache

const { webrun, webstop } = await import("../webrun")

const STATE_FILE = join(cache, "paladin", "webrun", "state.json")
const fixtures = join(import.meta.dir, "fixtures")

// bare components with no project around them -> virtual shell
const hello = join(fixtures, "hello", "App.tsx")
const bye = join(fixtures, "bye", "App.tsx")

// a real mini-project: index.html -> src/main.tsx -> ./App, plus a vite config
// with an alias. `project` is reachable from the entry, `orphan` is not.
const project = join(fixtures, "project", "src", "App.tsx")
const orphan = join(fixtures, "project", "src", "Orphan.tsx")

// every call passes this: no browser windows pop open during a test run, but
// everything else (vite boot, caching, pid bookkeeping) runs for real.
const PORT = 35738
const opts = { open: false, port: PORT }

/** read the cache file webrun just wrote */
const state = async () => JSON.parse(await readFile(STATE_FILE, "utf8")) as State

/** signal 0 doesn't deliver anything — it only checks the pid exists */
function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** killing is async (SIGTERM then SIGKILL), so poll instead of asserting immediately */
async function waitDead(pid: number, timeout = 5_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline && alive(pid)) await Bun.sleep(50)
  return !alive(pid)
}

/** fetch a module from the dev server — a 200 means vite resolved and transformed it */
async function fetchModule(url: string, path: string) {
  return await fetch(new URL(path, url))
}

describe("webrun", () => {
  // these tests are ordered and share one server on purpose: test 2 asserts the
  // server from test 1 is reused, test 3 asserts it gets replaced. that's the
  // whole point of the cache, so isolating them would test nothing.
  beforeAll(async () => {
    await webstop()
  })

  afterAll(async () => {
    await webstop()
    await rm(cache, { recursive: true, force: true })
  })

  test(
    "cold start: boots vite for a bare app and caches the server",
    async () => {
      const url = await webrun(hello, opts)

      // a successful run returns the url it would have opened
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)

      // no project index.html anywhere above the fixture, so we serve our own
      const s = await state()
      expect(s.mode).toBe("virtual")

      // the generated index.html is the mount point webrun scaffolded
      const html = await (await fetch(url!)).text()
      expect(html).toContain(`<div id="root">`)
      expect(html).toContain(`src="/main.tsx"`)

      // fetching the entry proves vite is really transforming tsx/jsx and not
      // just serving a static shell
      const main = await fetchModule(url!, "/main.tsx")
      expect(main.status).toBe(200)
      expect(await main.text()).toContain("createRoot")

      // and the run left behind a state file pointing at a live process
      expect(s.app).toBe(hello)
      expect(s.url).toBe(url)
      expect(alive(s.pid)).toBe(true)
    },
    60_000, // first boot pays for vite's dep-optimizer cache
  )

  test(
    "cache hit: same app reuses the running server instead of respawning",
    async () => {
      const before = await state()

      const url = await webrun(hello, opts)

      // same url AND same pid is the assertion that matters: a new vite would
      // have had a new pid
      expect(url).toBe(before.url)

      const after = await state()
      expect(after.pid).toBe(before.pid)
      expect(alive(after.pid)).toBe(true)
    },
    30_000,
  )

  test(
    "examples: a name.examples.tsx renders each exported function, in source order",
    async () => {
      const before = await state()
      const url = await webrun(join(fixtures, "gallery", "Card.examples.tsx"), opts)

      // swapped in on the same port, always through the generated shell
      expect(url).toBe(before.url)
      const after = await state()
      expect(after.mode).toBe("virtual")

      // same project as hello, so the running server is kept and only the entry
      // changes underneath it
      expect(after.pid).toBe(before.pid)
      expect(after.app).toContain("Card.examples.tsx")

      // the server can say how many tabs are attached (none here)
      expect(await (await fetchModule(url!, "/__webrun/clients")).text()).toBe("0")

      const main = await (await fetchModule(url!, "/main.tsx")).text()
      expect(main).toContain("Card.examples.tsx")
      expect(main).toContain("?raw")

      // the entry must compile, and the example file must resolve through it
      const ex = await fetchModule(url!, "/@fs" + join(fixtures, "gallery", "Card.examples.tsx"))
      expect(ex.status).toBe(200)
    },
    60_000,
  )

  test(
    "swap: another app in the same project is swapped in on the running server",
    async () => {
      const before = await state()

      const url = await webrun(bye, opts)

      // same port and the same process — nothing restarted
      expect(url).toBe(before.url)
      const after = await state()
      expect(after.app).toBe(bye)
      expect(after.pid).toBe(before.pid)
      expect(alive(after.pid)).toBe(true)

      // yet the entry now mounts the new app: the module graph was flushed, so
      // this is not a stale transform of the previous one
      const main = await (await fetchModule(url!, "/main.tsx")).text()
      expect(main).toContain("bye/App.tsx")
      expect(main).not.toContain("Card.examples.tsx")
    },
    60_000,
  )

  test(
    "passthrough: an app reachable from the project's index.html runs as the project does",
    async () => {
      const before = await state()
      const url = await webrun(project, opts)

      // a different project can't reuse the server: new process, old one gone
      const replaced = await state()
      expect(replaced.pid).not.toBe(before.pid)
      expect(await waitDead(before.pid)).toBe(true)

      const s = await state()
      expect(s.mode).toBe("passthrough")

      // their html, not ours: their mount id and their entry path, and none of
      // the shell we generate
      const html = await (await fetch(url!)).text()
      expect(html).toContain(`<div id="mount">`)
      expect(html).toContain(`src="/src/main.tsx"`)
      expect(html).not.toContain(`<div id="root">`)

      // the app imports "@/Badge", which only resolves if their config's alias
      // survived the merge — a 200 here is the whole point of merging
      const app = await fetchModule(url!, "/src/App.tsx")
      expect(app.status).toBe(200)

      const badge = await fetchModule(url!, "/src/Badge.tsx")
      expect(badge.status).toBe(200)
    },
    60_000,
  )

  test(
    "passthrough: our server settings win over theirs",
    async () => {
      const s = await state()

      // their config asks for port 5199 and server.open — we pass --port with
      // --strictPort and force open:false, so the run must be on our port and
      // must not have launched a browser
      expect(s.port).toBe(PORT)
      expect(await fetch(s.url).then((r) => r.ok)).toBe(true)
    },
    30_000,
  )

  test(
    "virtual fallback: a file the project's entry never imports gets the generated shell",
    async () => {
      // this is the case that makes presence-of-index.html the wrong signal:
      // Orphan.tsx sits inside the project, but their entry mounts App, so
      // passthrough here would silently render the wrong component
      const url = await webrun(orphan, opts)

      const s = await state()
      expect(s.mode).toBe("virtual")

      const html = await (await fetch(url!)).text()
      expect(html).toContain(`<div id="root">`)
      expect(html).not.toContain(`<div id="mount">`)

      // still merged their config, so aliases would work here too
      const main = await fetchModule(url!, "/main.tsx")
      expect(main.status).toBe(200)
    },
    60_000,
  )

  test(
    "failure: logs the error and leaves the running server alone",
    async () => {
      const before = await state()

      // webrun's only output is console.log on error, so capture it to assert
      // the message instead of letting it leak into the test report
      const logged: unknown[] = []
      const log = console.log
      console.log = (...args: unknown[]) => void logged.push(args[0])

      try {
        const url = await webrun(join(fixtures, "nope", "App.tsx"), opts)
        expect(url).toBeNull()
      } finally {
        console.log = log
      }

      expect(String(logged[0])).toContain("no such app")

      // a bad path is caught before any teardown, so the server that was
      // already up keeps running and keeps its state file. clearing state here
      // without killing would orphan a live vite with no pid left to stop it.
      expect(alive(before.pid)).toBe(true)
      const after = await state()
      expect(after.pid).toBe(before.pid)
      expect(after.url).toBe(before.url)
    },
    30_000,
  )
})
