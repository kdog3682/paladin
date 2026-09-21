import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { smartDedent } from "../string/smartDedent.ts"

export type WriteFilesFromTemplateOpts = {
  /* dir the template paths are relative to */
  root: string
}

/* a header line is a lone comment holding a path, ie `/* src/index.ts *\/` */
const HEADER = /^\/\*\s*([^\s*]*[./][^\s*]*)\s*\*\/$/

/*
 * write every file in a template of the form
 *
 *   /* src/index.ts *\/
 *   export const a = 1
 *
 *   /* package.json *\/
 *   {"name": "x"}
 *
 * indentation is removed with smartDedent, returns the written paths relative to root
 */
export function writeFilesFromTemplate(template: string, opts: WriteFilesFromTemplateOpts): string[] {
  const files: { path: string, lines: string[] }[] = []
  for (const line of smartDedent(template).split("\n")) {
    const header = line.match(HEADER)
    if (header) files.push({ path: header[1], lines: [] })
    else if (files.length) files[files.length - 1].lines.push(line)
    else if (line.trim()) throw new Error(`writeFilesFromTemplate: content before the first /* path */ header: ${line}`)
  }

  for (const file of files) {
    const target = join(opts.root, file.path)
    const text = smartDedent(file.lines.join("\n"))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, text ? text + "\n" : "")
  }
  return files.map((file) => file.path)
}
