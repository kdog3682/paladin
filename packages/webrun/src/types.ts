/**
 * `passthrough` runs the project as it normally runs — their index.html, their
 * root. `virtual` serves a generated shell that mounts the app on its own.
 */
export type Mode = "passthrough" | "virtual"

export type WebrunState = {
  /** schema version — an older file is repaired on read rather than trusted */
  version: number
  /** absolute path of the App file currently being served */
  app: string
  /** pid of the detached vite process */
  pid: number
  /** port vite is bound to */
  port: number
  /** url the server is reachable at */
  url: string
  /** generated scratch dir backing this run */
  workdir: string
  /** vite's combined stdout/stderr, tailed when a start fails */
  log: string
  /** whether the project's own index.html is serving the app, or ours is */
  mode: Mode
  /** epoch ms this server came up, so a reuse can report uptime */
  startedAt: number
  /** how many webrun calls this server has served, including the one that started it */
  runs: number
  /** bytes of the log already reported, so a report only shows errors logged since */
  logOffset: number
  /** the app a `--switch` took over from, which `--resume` serves again */
  previous?: string
}

export type WebrunOpts = {
  /** ms to wait for vite to answer before giving up. @default 15_000 */
  timeout?: number
  /** ms to settle after killing a previous server. @default 300 */
  settle?: number
  /** port to serve on. a fixed one keeps the url stable across restarts. @default 35737 */
  port?: number
  /**
   * force the browser open, or force it shut. left alone, a freshly started
   * server opens and a reused one prints a report instead. @default undefined
   */
  open?: boolean
  /** print the status report (url, pid, new errors) when an already-running server is reused. @default false */
  report?: boolean
  /** force a mode instead of detecting one. @default detected */
  mode?: Mode
  /** merge the project's own vite config underneath ours. @default true */
  userConfig?: boolean
  /**
   * a temporary swap: remember what was being served so `webresume` can put it back.
   * repeated switches keep the first app, so resume always returns to it. a plain
   * (non-switch) run of a different app forgets it. @default false
   */
  switch?: boolean
}

export type Layout = {
  /** what vite roots at: their index.html's dir in passthrough, our scratch dir in virtual */
  root: string
  /** our scratch dir, always holds the generated config and the log */
  workdir: string
  /** nearest ancestor with a package.json */
  project: string
  /** their vite config, merged under ours when present and not opted out of */
  userConfig: string | null
  /** paths vite is allowed to serve from */
  allow: string[]
  /** `@tailwindcss/vite` is installed, so the generated config can wire it up */
  tailwind: boolean
  /** sibling workspace packages the project depends on, which tailwind must scan too */
  sources: string[]
  mode: Mode
  /** `examples` when the target is a `<name>.examples.tsx` gallery instead of an app */
  kind: "app" | "examples"
}
