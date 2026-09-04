import { clip, collectFiles } from "@paladin/utils"
import { docgen, docgenPackage, generatePackageIndex } from "./docgen"

// const dir = "/home/kdog3682/projects/mathpen/packages/manim/src"
const dir = "/home/kdog3682/projects/paladin/packages/codemod/src/utils"

// const files = await collectEntryFiles(dir)
// const files = collectFiles(dir)
// clip(await docgen(files))
// let a = await docgenPackage('@mathpen/manim', {exclude: {files: ['lexer.ts', 'layout.ts', 'parser.ts', 'render.ts', 'demo.ts'], symbols: ['renderPdf', 'AstNode']}})
// // // console.log(a)
// let a = await docgenPackage('@paladin/utils')
// clip(a)


// clip(await docgenPackage('@mathpen/manim'))
// clip(await docgenPackage(dir))