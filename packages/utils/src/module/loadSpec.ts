/*
resolves a "<specifier>#<export>" spec against a root directory and returns the export.
  loadSpec("src/manim/display.ts#display", { root: "/repo/a/packages/b" })
  loadSpec("@a/b/display#display", { root })
  loadSpec("./render.ts", { root })            // -> default export
*/
import { pathToFileURL } from "node:url"

export type LoadSpecOptions = {
  /* directory the specifier is resolved relative to */
  root: string
  /* export name to use when the spec has no "#name" suffix */
  fallbackName?: string
}

export async function loadSpec<T = unknown>(spec: string, options: LoadSpecOptions): Promise<T> {
  const { root, fallbackName = "default" } = options
  const [raw, name = fallbackName] = spec.split("#")
  const file = /^[@./]/.test(raw) ? raw : `./${raw}`
  const url = import.meta.resolve(file, pathToFileURL(`${root}/`).href)
  const mod = await import(url)
  if (!(name in mod)) {
    throw new Error(`${spec} (from ${root}): no export named "${name}"`)
  }
  return mod[name] as T
}

export async function loadSpecFunction(spec: string, options: LoadSpecOptions): Promise<Function> {
  const value = await loadSpec(spec, options)
  if (typeof value !== "function") {
    throw new Error(`${spec} (from ${options.root}): export is not a function`)
  }
  return value
}
