import type { PackageData } from "../types"
import { removeShadowedFiles } from "./removeShadowedFiles"
import { updateBarrel } from "./updateBarrel"

export async function postProcessPackageFiles(pkg: PackageData) {
	await removeShadowedFiles(pkg)
	await updateBarrel(pkg)
	return pkg
}
