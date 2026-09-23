import { basename } from "node:path"
import { expandHome } from "@paladin/utils"
import { deprecate, isWrite, write } from "../ops"
import type { PostProcessorOptions } from "./types"
import type { FsOp, Unit } from "../types"

const SOURCE = "router"

/**
 * Some incoming files don't belong wherever their header resolved them to — they
 * always land at the same fixed spot on disk, whatever project dropped them.
 * Keyed by filename (`basename`), value is a `~`-relative or absolute destination.
 */
export const DEFAULT_ROUTES: Record<string, string> = {
  "credentials.json": "~/dotfiles/gapi/credentials.json",
}

/**
 * Reroutes matching writes to their fixed destination: deprecates the op at its
 * original path (so it's never written there) and adds the same write at the
 * fixed one instead. Runs before `hydrateBoilerplate`/`resolveDependencies`, so a
 * rerouted file never triggers barreling or dependency scanning for the unit it
 * happened to land in.
 */
export function router(unit: Unit, opts: PostProcessorOptions = {}): FsOp[] {
  const routes = { ...DEFAULT_ROUTES, ...opts.router }
  const ops: FsOp[] = []

  for (const op of unit.ops) {
    if (!isWrite(op)) continue

    const dest = routes[basename(op.path)]
    if (!dest) continue

    const resolved = expandHome(dest)
    if (op.path === resolved) continue

    ops.push(deprecate(SOURCE, op.path), write(SOURCE, resolved, op.content, op.mode))
  }

  return ops
}
