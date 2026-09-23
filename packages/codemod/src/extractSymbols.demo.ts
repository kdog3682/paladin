import { relative } from "node:path"
import { ts } from "ts-morph"
import { extractSymbols } from "./codemods/extractSymbols"
import { createProject, projectRoot } from "./project"

const root = projectRoot("paladin")

const items = [
  { file: "packages/web/src/keybindings/inoremap.ts", symbols: ["inoremap"] },
  {
    file: "packages/web/src/keybindings/qchord.ts",
    symbols: ["executeCursorRight", "executeNewlineDedent", "executeNewlineIndent"],
  },
]

// extractSymbols resolves imports itself (resolveModuleFile), so the program has no reason to
// parse the whole graph when the checker gets touched.
const project = createProject(
  "paladin",
  items.map(item => item.file),
  { noResolve: true },
)

const output = extractSymbols(project, items, { root })

console.log(output)

const loaded = project.getSourceFiles().map(file => relative(root, file.getFilePath()))
console.error(`\n${loaded.length} files loaded:\n${loaded.map(path => `  ${path}`).join("\n")}`)
