import { clip, collectFiles } from "@paladin/utils"
import { docgen } from "./docgen"
import { collectEntryFiles } from "./entrypoints"

// const dir = "/home/kdog3682/projects/mathpen/packages/manim/src"
const dir = "/home/kdog3682/projects/paladin/packages/codemod/src/utils"

// const files = await collectEntryFiles(dir)
const files = collectFiles(dir)
clip(await docgen(files))

/* for some reason ... lexer is pulled in
   and also parse brings in AstNode
   normalizeStroke isnt needed.

   perhaps, collectEntrySymbols
   the ones that have been used
*/