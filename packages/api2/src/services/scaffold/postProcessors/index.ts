import { deleteShadowedFiles } from "./deleteShadowedFiles"
import { router } from "./router"
import { updateBarrel } from "./updateBarrel"
import type { PostProcessor } from "./types"

export const postProcessors: PostProcessor[] = [router, deleteShadowedFiles, updateBarrel]

export type { PostProcessor, PostProcessorOptions, UpdateBarrelOptions } from "./types"
export { deleteShadowedFiles, router, updateBarrel }
