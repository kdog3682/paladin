import { readFileSafe, writeFileSafe } from "../../utils/fs"
import { parse, print, b } from "../ast/parse"
import { addImport } from "../ast/add-import"
import { addToArray } from "../ast/add-to-array"
import { appletNameFromPath, isAppletPath, kebab } from "../paths"
import type { Wirer, WireContext, WirerResult } from "../types"

export const appletWirer: Wirer = {
  name: "applet",
  match: isAppletPath,
  async run(paths, ctx): Promise<WirerResult> {
    if (!paths.length) return { modified: [] }
    const source = await readFileSafe(ctx.webAppPath)
    if (!source)
      throw new Error(`App.tsx not found at ${ctx.webAppPath}`)
    const ast = parse(source)

    for (const p of paths) {
      registerApplet(ast, p)
    }

    await writeFileSafe(ctx.webAppPath, print(ast))
    return { modified: [ctx.webAppPath] }
  },
}

export function registerApplet(ast: any, appletPath: string) {
  const name = appletNameFromPath(appletPath)
  if (!name) return
  const id = kebab(name)

  addImport(ast, {
    name,
    from: `@/components/applets/${name}`,
    kind: "named",
  })

  const element = b.objectExpression([
    b.objectProperty(b.identifier("id"), b.stringLiteral(id)),
    b.objectProperty(b.identifier("label"), b.stringLiteral(name)),
    b.objectProperty(b.identifier("component"), b.identifier(name)),
  ])

  addToArray(ast, { arrayName: "APPLETS", element, dedupeKey: "id" })
}

// allow calling applet wiring directly from other wirers without re-reading App.tsx
export async function wireApplets(
  appletPaths: string[],
  ctx: WireContext,
): Promise<WirerResult> {
  return (await appletWirer.run(appletPaths, ctx)) ?? {}
}
