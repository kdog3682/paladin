import { generateApiIndexFile } from "./generateApiIndexFile"

const spec = "@mathpen/manim"
const { api, root } = await generateApiIndexFile(spec, {
  root: {
    includes: ["fromJSON as deserialize", "toJSON as serialize", "display"],
  },
  // Manual verification scripts, not api demos - their imports are internals being spot-checked,
  // not the public surface they'd otherwise get credited for demonstrating.
  excludeFiles: ["render/scratch.demo.ts"],
  exclude: [
    "AnnotationPointer",
    "AnnularSector",
    "Connector",
    "AnnotationBox",
    "RegularPolygon",
    "LabeledArrow",
    "Annulus",
    "ArrowTip",
    "Brace",
    "CGroup",
    "Cobject",
    "Ellipse",
    "ExprSyntaxError",
    "Mcq",
    "RoundedRectangle",
    "SurroundingRectangle",
    "Square",
    "Triangle",
  ],
  aliases: { rect: "Rectangle", bezier: "CubicBezier" },
})

console.log(`wrote ${api}\n`)
console.log(await Bun.file(api).text())

if (root) {
  console.log(`wrote ${root}\n`)
  console.log(await Bun.file(root).text())
}
