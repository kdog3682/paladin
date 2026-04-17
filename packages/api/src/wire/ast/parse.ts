import * as recast from "recast"
import tsParser from "recast/parsers/typescript"

export const b = recast.types.builders
export const n = recast.types.namedTypes

export function parse(source: string) {
  return recast.parse(source, { parser: tsParser })
}

export function print(ast: any) {
  return recast.print(ast, { quote: "single" }).code
}
