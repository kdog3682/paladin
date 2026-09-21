import { afterAll, beforeAll, describe, expect, setDefaultTimeout, spyOn, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

// state lives under XDG_CACHE_HOME, resolved once at module load: point it at a
// throwaway dir before importing the cli, so no real server is seen or touched
process.env.XDG_CACHE_HOME = await mkdtemp(join(tmpdir(), "webrun-cli-test-"))

const { main } = await import("../cli")

// the probe tests launch headless chrome
setDefaultTimeout(30_000)

/** run the cli, returning its exit code and everything it printed */
async function run(...argv: string[]) {
  const out: string[] = []
  const log = spyOn(console, "log").mockImplementation((...a) => void out.push(a.join(" ")))
  const err = spyOn(console, "error").mockImplementation((...a) => void out.push(a.join(" ")))
  try {
    const code = await main(argv)
    return { code, out: out.join("\n") }
  } finally {
    log.mockRestore()
    err.mockRestore()
  }
}

let server: ReturnType<typeof Bun.serve>
beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: () => new Response("<h1>hello probe</h1><button>go</button>", { headers: { "content-type": "text/html" } }),
  })
})
afterAll(() => server.stop(true))

describe("webrun cli", () => {
  test("no target and no action prints help", async () => {
    const r = await run()
    expect(r.code).toBe(0)
    expect(r.out).toContain("usage: webrun")
    expect(r.out).toContain("--click <sel>")
  })

  test("--status with nothing running says so", async () => {
    const r = await run("--status")
    expect(r.code).toBe(0)
    expect(r.out).toContain("nothing running")
  })

  test("an action with no server running fails and says how to start one", async () => {
    const r = await run("--text", "h1")
    expect(r.code).toBe(1)
    expect(r.out).toContain("no webrun server is running")
  })

  test("an http url is probed as is", async () => {
    const r = await run(server.url.href, "--text", "h1", "--preview")
    expect(r.code).toBe(0)
    expect(r.out).toContain("hello probe")
    expect(r.out).toContain("## page")
  })

  test("a failing action exits 1", async () => {
    const r = await run(server.url.href, "--expect", "#nope", "--text", "h1")
    expect(r.code).toBe(1)
    expect(r.out).toContain("✗")
  })

  test("a typo'd flag is a usage error with a suggestion", async () => {
    const r = await run("--clik", "x")
    expect(r.code).toBe(2)
    expect(r.out).toContain("did you mean --click")
  })

  test("a missing app path fails without probing", async () => {
    const r = await run("/no/such/App.tsx", "--text", "h1")
    expect(r.code).toBe(1)
    expect(r.out).toContain("no such app")
  })
})
