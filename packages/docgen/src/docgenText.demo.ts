import { clip } from "@paladin/utils"
import { docgenText } from "./docgenSymbols"

const text = `
@mathpen/manim

Markup Grid Flex Recipe




`

const markdown = await docgenText(text, { exclude: [] })
// console.log(markdown)
clip(markdown)



