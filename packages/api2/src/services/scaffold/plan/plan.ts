import { groupOps } from "./groupOps"
import { parseFileContent } from "./parseFileContent"
import { readSources } from "./readSources"
import type { FsOp, PathResolutionOpts, Project } from "../types"

/**
 * Reads a scaffold input (or several, planned as one project) — a file, a zip, or a blob of path-commented sources
 * (// src/foobar.ts \n <code> \n ...) — and works out the ops it implies,
 * grouped into units. Nothing has touched disk when this returns; apply does that.
 */
export async function plan(input: string | string[], opts: PathResolutionOpts): Promise<Project | null> {
  const contents = await readSources(input)

  const ops = contents
    .map((content) => parseFileContent(content, opts))
    .filter((op): op is FsOp => Boolean(op))

  return groupOps(ops, opts)
}
