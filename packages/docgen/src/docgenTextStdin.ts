import { clip } from "@paladin/utils"
import { docgenText } from "./docgenSymbols"

const text = await Bun.stdin.text()
const markdown = await docgenText(text)
const sections = [
  markdown.trim() && `# Reference API\n\n${markdown.trim()}`,
  `# Instructions\n\n${text.trim()}`,
]
await clip(sections.filter(Boolean).join("\n\n"))
