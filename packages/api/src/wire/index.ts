import { buildContext } from "./paths"
import { drizzleWirer } from "./wirers/drizzle"
import { featureWirer } from "./wirers/feature"
import { appletWirer } from "./wirers/applet"
import type { Wirer, WireContext } from "./types"

// ordered: drizzle first, then feature (which generates applets and calls applet wirer
// internally), then applet for any standalone applet paths in the input
const WIRERS: Wirer[] = [drizzleWirer, featureWirer, appletWirer]

export interface WireResult {
  written: string[]
  modified: string[]
}

export async function wire(
  paths: string[],
  ctx?: WireContext,
): Promise<WireResult> {
  const context = ctx ?? buildContext()
  const written: string[] = []
  const modified: string[] = []

  for (const w of WIRERS) {
    const matched = paths.filter(w.match)
    if (!matched.length) continue
    const result = await w.run(matched, context)
    if (result?.written) written.push(...result.written)
    if (result?.modified) modified.push(...result.modified)
  }

  return { written, modified }
}

export type { Wirer, WireContext } from "./types"
