import { join, relative } from "node:path"
import { gatherPublicExports } from "./codemods/gatherPublicExports"
import { createProject, projectRoot } from "./project"

const spec = "mathpen/manim"
const dir = projectRoot(spec)
const src = join(dir, "src")
const barrelPath = join(src, "index.ts")

const project = createProject(spec)
const found = gatherPublicExports(project, { base: "Mobject" })

/** `src/mobject/frame.ts` -> `./mobject/frame`, `src/geometry/index.ts` -> `./geometry` */
function toSpecifier(file: string) {
  const rel = relative(src, file).replace(/\.(tsx?|mts|cts)$/, "").replace(/\/index$/, "")
  return rel.startsWith(".") ? rel : `./${rel}`
}

const byFile = Map.groupBy(
  found.filter((e) => e.file !== barrelPath),
  (e) => toSpecifier(e.file),
)

const blocks = [...byFile]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([specifier, entries]) => {
    const items = entries
      .map((e) => {
        const name = e.isDefault ? `default as ${e.name}` : e.name
        return e.kind === "type" ? `type ${name}` : name
      })
      .sort((a, b) => a.replace(/^type /, "").localeCompare(b.replace(/^type /, "")))

    if (items.length === 1) return `export { ${items[0]} } from "${specifier}"`
    return `export {\n${items.map((i) => `\t${i},`).join("\n")}\n} from "${specifier}"`
  })

// report on stderr, so stdout is just the barrel
for (const e of found) {
  const how = e.signature !== undefined
    ? `imported by ${e.usedIn.length}, ${e.signature}`
    : `reached via ${e.via.join(", ")}`
  console.error(`${e.name.padEnd(24)} ${e.kind.padEnd(8)} ${how}`)
}
console.error(`\n${found.length} exports across ${byFile.size} files\n`)

console.log(`// ${relative(dir, barrelPath)}\n`)
console.log(blocks.join("\n"))
