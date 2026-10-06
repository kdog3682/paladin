// the one vite config storylite serves with. there is no generated copy: the CLI
// describes the run in STORYLITE_PLAN and this reads it.
import react from "@vitejs/plugin-react"
import { createRequire } from "node:module"
import { join, relative } from "node:path"
import { pathToFileURL } from "node:url"
import { defineConfig, loadConfigFromFile, mergeConfig } from "vite"
import { exportOrder, findStories, stylesPath, titleOf, type Plan } from "./find"

const plan: Plan = JSON.parse(process.env.STORYLITE_PLAN!)
// this file is bundled before it runs, so its own location is passed in rather than read
const CLIENT = join(process.env.STORYLITE_HOME!, "src", "client", "main.tsx")
const VIRTUAL = "virtual:storylite/stories"

/**
 * plugins from their config that start a run of their own (a test suite, a
 * checker, a story runner). mergeConfig concatenates plugin arrays, so keeping
 * them would run them inside our dev server.
 */
const BLOCKED = ["vitest", "vite-plugin-checker", "storybook", "coverage", "istanbul", "vite-plugin-dts"]

const named = (p: any) => String(p?.name ?? "")
const keep = (p: any) => named(p) !== "" && !BLOCKED.some((b) => named(p).includes(b))

/** what the page imports: every stories file, its title and its exports in written order */
function storiesModule() {
  const entries = findStories(plan.target).map((file) => {
    const url = JSON.stringify("/@fs" + file)
    return `  { file: ${JSON.stringify(relative(plan.project, file))}, title: ${JSON.stringify(titleOf(file, plan.project))}, order: ${JSON.stringify(exportOrder(file))}, load: () => import(${url}) },`
  })
  const css = plan.tailwind ? `import ${JSON.stringify("/@fs" + stylesPath(plan))}\n` : ""
  return `${css}export default [\n${entries.join("\n")}\n]\n`
}

function html() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>storylite</title>
    <link rel="icon" href="data:," />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${"/@fs" + CLIENT}"></script>
  </body>
</html>
`
}

function storylite(): any {
  return {
    name: "storylite",
    resolveId: (id: string) => (id === VIRTUAL ? "\0" + VIRTUAL : null),
    load: (id: string) => (id === "\0" + VIRTUAL ? storiesModule() : null),
    configureServer(server: any) {
      // ahead of vite's own middleware, so a project's index.html never shadows the page
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url?.split("?")[0] !== "/") return next()
        res.setHeader("content-type", "text/html")
        res.end(await server.transformIndexHtml("/", html()))
      })

      // the story list, titles and export order are baked into the virtual module, so any
      // change to a stories file (or one appearing, or going) rebuilds it and reloads the page.
      // reloading also re-runs every play, which is what you want after an edit
      const refresh = (file: string) => {
        if (!/\.stories\.[jt]sx?$/.test(file)) return
        const mod = server.moduleGraph.getModuleById("\0" + VIRTUAL)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: "full-reload", path: "*" })
      }
      server.watcher.on("add", refresh).on("unlink", refresh).on("change", refresh)
    },
  }
}

/** their tailwind plugin, resolved from their project rather than ours */
async function tailwind() {
  const path = createRequire(join(plan.project, "package.json")).resolve("@tailwindcss/vite")
  return (await import(pathToFileURL(path).href)).default()
}

export default defineConfig(async (env) => {
  const loaded = plan.userConfig ? await loadConfigFromFile(env, plan.userConfig) : null
  // `test` is vitest's block riding along in a shared config, and `build` can widen dep scanning
  const { test: _test, build: _build, ...base } = (loaded?.config ?? {}) as any

  const plugins = (base.plugins ?? []).flat(Infinity).filter(keep)
  base.plugins = plugins

  const extra: any[] = [storylite()]
  // two react plugins in one pipeline break fast refresh
  if (!plugins.some((p: any) => named(p).startsWith("vite:react"))) extra.push(react())
  // v4's vite plugin, or v3 through postcss, already handles it — layering ours double-processes
  const hasTailwind = base.css?.postcss || plugins.some((p: any) => named(p).includes("tailwindcss"))
  if (plan.tailwind && !hasTailwind) extra.push(await tailwind())

  // ours is the second argument, so these win over whatever they set
  return mergeConfig(base, {
    root: plan.project,
    cacheDir: join(plan.workdir, ".vite"),
    clearScreen: false,
    plugins: extra,
    // one react for the page, the stories and the runner, even if the project carries its own copy
    resolve: { dedupe: ["react", "react-dom"] },
    optimizeDeps: {
      // the runner lives outside the project, so the scan never finds its imports
      include: ["react", "react-dom", "react-dom/client", "react/jsx-dev-runtime", "@testing-library/dom", "@testing-library/user-event"],
      entries: [CLIENT, ...findStories(plan.target)],
    },
    server: { host: "127.0.0.1", open: false, fs: { allow: plan.allow } },
  })
})
