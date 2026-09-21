import { mkdir, writeFile } from "node:fs/promises"
import { basename, join, relative } from "node:path"
import type { Layout } from "./types"

const TEMPLATE_DIR = join(import.meta.dir, "templates")

/**
 * plugin name fragments dropped from the merged config. these are the ones that
 * hook `configureServer` and start a run — the reason a plain `webrun App.tsx`
 * could end up executing a test suite.
 */
export const BLOCKED_PLUGINS = [
  "vitest",
  "vite-plugin-checker",
  "storybook",
  "coverage",
  "istanbul",
  "vite-plugin-dts",
]

const cache = new Map<string, string>()

/**
 * read a template off disk, cached for the process.
 *
 * read rather than imported so the templates stay editable in place — the cost
 * is that they must ship next to the source, so no bundling.
 */
async function template(name: string) {
  const hit = cache.get(name)
  if (hit) return hit

  const path = join(TEMPLATE_DIR, name)
  const file = Bun.file(path)
  if (!(await file.exists())) throw new Error(`missing template: ${path}`)

  const text = await file.text()
  cache.set(name, text)
  return text
}

/** substitute `{{name}}`. every placeholder must be supplied — a typo is a throw, not a hole */
export function render(source: string, vars: Record<string, string>) {
  return source.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    if (!(key in vars)) throw new Error(`template placeholder has no value: {{${key}}}`)
    return vars[key]!
  })
}

/** the merged config for a layout — the same layout always renders the same text */
async function renderConfig(layout: Layout) {
  const { root, workdir, userConfig, allow, tailwind } = layout

  return render(await template("vite.config.tmpl"), {
    tailwindImport: tailwind ? `import tailwind from "@tailwindcss/vite"` : "",
    tailwindExtra: tailwind
      ? "if (!hasTailwind(plugins, base)) extra.push(tailwind())"
      : "void hasTailwind",
    userImport: userConfig ? `import user from ${JSON.stringify(userConfig)}` : "",
    userExpr: userConfig
      ? `(typeof user === "function" ? await (user as any)(env) : await (user as any)) ?? {}`
      : "{}",
    blocked: JSON.stringify(BLOCKED_PLUGINS),
    root: JSON.stringify(root),
    cacheDir: JSON.stringify(join(workdir, ".vite")),
    allow: JSON.stringify(allow),
  })
}

const configPath = (layout: Layout) => join(layout.workdir, "vite.config.ts")

/**
 * would this layout run on the config a server already has loaded? if so an app
 * can be swapped in place — same root, same plugins, same access — instead of
 * restarting vite.
 */
export async function configMatches(layout: Layout) {
  const current = await Bun.file(configPath(layout)).text().catch(() => null)
  return current === (await renderConfig(layout))
}

/**
 * written into the scratch dir in both modes. left alone when unchanged: vite
 * watches its own config and restarts itself on any write, identical or not.
 */
async function writeConfig(layout: Layout) {
  if (await configMatches(layout)) return
  await writeFile(configPath(layout), await renderConfig(layout))
}

/**
 * the index.html + entry pair we serve when the project has none that fits.
 *
 * an `.examples.tsx` target gets the gallery entry instead of the app entry.
 * the stylesheet only exists when tailwind does — an unconditional
 * `@import "tailwindcss"` would 500 the page in a project that never had it.
 */
async function writeShell(layout: Layout, app: string) {
  const { workdir, tailwind, kind, project } = layout
  const rel = relative(workdir, app).replaceAll("\\", "/")
  const entry = rel.startsWith(".") ? rel : "./" + rel
  const title = basename(app)

  await writeFile(join(workdir, "index.html"), render(await template("index.html.tmpl"), { title }))

  if (tailwind) {
    await writeFile(
      join(workdir, "styles.css"),
      render(await template("styles.css.tmpl"), { project: JSON.stringify(project) }),
    )
  }

  await writeFile(
    join(workdir, "main.tsx"),
    render(await template(kind === "examples" ? "examples.tsx.tmpl" : "main.tsx.tmpl"), {
      title,
      styles: tailwind ? `import "./styles.css"` : "",
      entry: JSON.stringify(entry),
      // the raw source, only to recover declaration order — a module namespace
      // enumerates alphabetically, which would scramble the examples
      source: JSON.stringify(entry + "?raw"),
    }),
  )
}

export async function scaffold(layout: Layout, app: string) {
  await mkdir(layout.workdir, { recursive: true })
  await writeConfig(layout)
  if (layout.mode === "virtual") await writeShell(layout, app)
}
