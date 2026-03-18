import Parser from 'tree-sitter'
import TS from 'tree-sitter-typescript'
const p = new Parser()
p.setLanguage(TS.typescript)
const src = await Bun.file('/home/kdog3682/projects/paladin/packages/codeform/src/documenter.ts').text()
const t = p.parse(src)
const fns = t.rootNode.descendantsOfType('formal_parameters')
for (const fn of fns) {
  for (const c of fn.namedChildren) {
    console.log({ type: c.type, text: c.text.slice(0, 60) })
  }
}
