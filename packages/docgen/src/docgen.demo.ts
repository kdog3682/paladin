import { clip } from "@paladin/utils"
import { docgenText, docgenSymbols } from "./docgenSymbols"

const text = `
@mathpen/manim

Markup Grid Flex Recipe




`

// const markdown = await docgenText(text, { exclude: [] })
// console.log(markdown)
const markdown = await docgenSymbols("@mathpen/manim", [
    'typeset', 'paginate'
])
clip(markdown)



