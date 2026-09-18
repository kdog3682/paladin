import { clip } from "@paladin/utils"
import { docgenText } from "./docgenSymbols"

const text = await Bun.stdin.text()
const markdown = await docgenText(text)
await clip(text, markdown)
