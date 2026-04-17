import type { ExportedFn } from "../types"

export function generateRoutesFile(
  featureName: string,
  fns: ExportedFn[],
): string {
  const importName = `* as ${featureName}`
  const lines: string[] = []
  lines.push(`import { Hono } from 'hono'`)
  lines.push(`import ${importName} from './${featureName}.service'`)
  lines.push("")
  lines.push(`const app = new Hono()`)
  lines.push("")
  for (const fn of fns) {
    lines.push(renderHandler(featureName, fn))
    lines.push("")
  }
  lines.push(`export default app`)
  lines.push("")
  return lines.join("\n")
}

function renderHandler(feature: string, fn: ExportedFn): string {
  const methodLower = fn.method.toLowerCase()
  const route = JSON.stringify(fn.route)
  const paramNames = fn.params.map((p) => p.name)

  const destructure = paramNames.length
    ? `const { ${paramNames.join(", ")} } = `
    : ""
  const extractor =
    fn.method === "GET" || fn.method === "DELETE"
      ? `c.req.query()`
      : `await c.req.json()`

  const call = `${feature}.${fn.name}(${paramNames.join(", ")})`
  const body = fn.hasReturn
    ? `    const result = await ${call}\n    return c.json(result)`
    : `    await ${call}\n    return c.json({ ok: true })`

  const extraction = paramNames.length
    ? `    ${destructure}${extractor}\n`
    : ""
  return `app.${methodLower}(${route}, async (c) => {\n${extraction}${body}\n})`
}
