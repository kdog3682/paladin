import { deleteShadowedFiles } from "./deleteShadowedFiles"
import { updateBarrel } from "./updateBarrel"
import type { FsOp, Unit } from "../types"

/** Reads a unit's ops and adds more. Never touches disk. */
export type PostProcessor = (unit: Unit) => FsOp[] | Promise<FsOp[]>

export const postProcessors: PostProcessor[] = [deleteShadowedFiles, updateBarrel]

export { deleteShadowedFiles, updateBarrel }
