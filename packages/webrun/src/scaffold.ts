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

/** the merged config, written into the scratch dir in both modes */
async function writeConfig(layout: Layout) {
  const { root, workdir, userConfig, allow, tailwind } = layout

  const source = render(await template("vite.config.tmpl"), {
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

  await writeFile(join(workdir, "vite.config.ts"), source)
}

/**
 * the index.html + entry pair we serve when the project has none that fits.
 *
 * the stylesheet only exists when tailwind does — an unconditional
 * `@import "tailwindcss"` would 500 the page in a project that never had it.
 */
async function writeShell(layout: Layout, app: string) {
  const { workdir, tailwind } = layout
  const rel = relative(workdir, app).replaceAll("\\", "/")
  const title = basename(app)

  await writeFile(join(workdir, "index.html"), render(await template("index.html.tmpl"), { title }))

  if (tailwind) {
    await writeFile(join(workdir, "styles.css"), await template("styles.css.tmpl"))
  }

  await writeFile(
    join(workdir, "main.tsx"),
    render(await template("main.tsx.tmpl"), {
      title,
      styles: tailwind ? `import "./styles.css"` : "",
      entry: JSON.stringify(rel.startsWith(".") ? rel : "./" + rel),
    }),
  )
}

export async function scaffold(layout: Layout, app: string) {
  await mkdir(layout.workdir, { recursive: true })
  await writeConfig(layout)
  if (layout.mode === "virtual") await writeShell(layout, app)
}
