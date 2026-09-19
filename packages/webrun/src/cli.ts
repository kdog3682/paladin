import type { WebrunOpts } from "./types"
import { formatReport, webrun, webstatus, webstop } from "./webrun"

const USAGE = [
  "usage: webrun <path/to/App.tsx> [options]",
  "",
  "  --open              open the browser even on a reused server",
  "  --no-open           never open the browser",
  "  --virtual           force the generated shell",
  "  --passthrough       force the project's own index.html",
  "  --no-user-config    ignore the project's vite config entirely",
  "  --stop              stop the running server",
  "  --status            print the running server",
].join("\n")

export async function main(argv = process.argv.slice(2)) {
  const flags = new Set(argv.filter((a) => a.startsWith("-")))
  const target = argv.find((a) => !a.startsWith("-"))

  if (flags.has("--stop")) return void (await webstop())

  if (flags.has("--status")) {
    const state = await webstatus()
    console.log(state ? formatReport(state) : "webrun · nothing running")
    return
  }

  if (!target || flags.has("--help") || flags.has("-h")) return void console.log(USAGE)

  const opts: WebrunOpts = {}
  if (flags.has("--open")) opts.open = true
  if (flags.has("--no-open")) opts.open = false
  if (flags.has("--virtual")) opts.mode = "virtual"
  if (flags.has("--passthrough")) opts.mode = "passthrough"
  if (flags.has("--no-user-config")) opts.userConfig = false

  await webrun(target, opts)
}

if (import.meta.main) await main()
