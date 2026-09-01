import { homedir } from "node:os"
import { join } from "node:path"
import { getMostRecentFile } from "@paladin/utils"
import { ScaffoldService } from "./services/scaffold/scaffold"

const dir = join(homedir(), "scratch")

const file = await getMostRecentFile({ dir, ext: "zip" })
if (!file) {
  console.error(`no files in ${dir}`)
  process.exit(1)
}

console.log(`scaffolding from ${file}`)

const service = new ScaffoldService()
const result = await service.process(file)

if (!result) {
  console.error("nothing to do")
  process.exit(1)
}
