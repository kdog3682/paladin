import { deleteShadowedFiles } from "./deleteShadowedFiles"
import { updateBarrel } from "./updateBarrel"
import type { Unit } from "../types"

export type PostProcessor = (unit: Unit) => void | Promise<void>

export const postProcessors: PostProcessor[] = [deleteShadowedFiles, updateBarrel]

export { deleteShadowedFiles, updateBarrel }
