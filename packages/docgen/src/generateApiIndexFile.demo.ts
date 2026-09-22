import { generateApiIndexFile } from "./generateApiIndexFile"

const spec = "@mathpen/manim"
const { api, root } = await generateApiIndexFile(spec, {
  root: {
    includes: ["fromJSON as deserialize", "toJSON as serialize", "display"],
  },
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
