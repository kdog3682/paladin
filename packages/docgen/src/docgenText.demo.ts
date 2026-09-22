import { clip } from "@paladin/utils"
import { docgenText } from "./docgenSymbols"

const text = `
@mathpen/manim

use block, flex, grid, Grid, Flex

the page is 





`

const markdown = await docgenText(text, { exclude: [] })
// console.log(markdown)
clip(markdown)



