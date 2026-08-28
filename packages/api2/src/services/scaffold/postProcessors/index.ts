import { deleteShadowedFiles } from "./deleteShadowedFiles"
import { updateBarrel } from "./updateBarrel"
import type { PostProcessResult, Unit } from "../types"

export type PostProcessor = (unit: Unit) => PostProcessResult | Promise<PostProcessResult>

export const postProcessors: PostProcessor[] = [deleteShadowedFiles, updateBarrel]

export { deleteShadowedFiles, updateBarrel }
