// @paladin/docgen/docgen.demo.ts

import { expandHome } from "@paladin/utils/fs"
import { docgen } from "./index"

const rootDir = expandHome("~/projects/paladin/packages/docgen")
const { results, markdown } = docgen(rootDir)

console.log(markdown)
