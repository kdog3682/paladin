import yaml from "js-yaml"
import { deepMap, truncateLines } from "@paladin/utils"

export type PrintOptions = {
  /** kept content lines per multiline string, middle collapsed (default 6) */
  maxLines?: number
  indent?: number
}

/** trailing whitespace forces js-yaml into quoted style, so scrub it */
function scrub(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
}

export function print(value: unknown, options: PrintOptions = {}): string {
  const { maxLines = 6, indent = 2 } = options

  const prepared = deepMap(value, (leaf) =>
    typeof leaf === "string" && leaf.includes("\n")
      ? truncateLines(scrub(leaf), { maxLines })
      : leaf,
  )

  return yaml.dump(prepared, {
    indent,
    lineWidth: -1,
    noRefs: true,
    noCompatMode: true,
    quotingType: '"',
  })
}
