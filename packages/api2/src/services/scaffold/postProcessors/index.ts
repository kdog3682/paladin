import { deleteShadowedFiles } from "./deleteShadowedFiles"
import { updateBarrel } from "./updateBarrel"
import type { PostProcessor } from "./types"

export const postProcessors: PostProcessor[] = [deleteShadowedFiles, updateBarrel]

export type { PostProcessor, PostProcessorOptions, UpdateBarrelOptions } from "./types"
export { deleteShadowedFiles, updateBarrel }
