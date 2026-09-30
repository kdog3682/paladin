import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { smartDedent } from "../string/smartDedent.ts"

export type WriteFilesFromTemplateOpts = {
  /* dir the template paths are relative to */
  root: string
}

/* a header line is a lone comment holding a path, ie `/* src/index.ts *\/` */
const HEADER = /^\/\*\s*([^\s*]*[./][^\s*]*)\s*\*\/$/

export type TemplateFile = {
  /* path relative to the template root */
  path: string
  text: string
}

/*
 * parse a template of the form
 *
 *   /* src/index.ts *\/
 *   export const a = 1
 *
 *   /* package.json *\/
 *   {"name": "x"}
 *
 * into its files, without touching the disk. indentation is removed with smartDedent
 */
export function parseFilesFromTemplate(template: string): TemplateFile[] {
  const files: { path: string, lines: string[] }[] = []
  for (const line of smartDedent(template).split("\n")) {
    const header = line.match(HEADER)
    if (header) files.push({ path: header[1], lines: [] })
    else if (files.length) files[files.length - 1].lines.push(line)
    else if (line.trim()) throw new Error(`writeFilesFromTemplate: content before the first /* path */ header: ${line}`)
  }

  return files.map((file) => {
    const text = smartDedent(file.lines.join("\n"))
    return { path: file.path, text: text ? text + "\n" : "" }
  })
}

/* write every file of a template (see parseFilesFromTemplate), returns the written paths relative to root */
export function writeFilesFromTemplate(template: string, opts: WriteFilesFromTemplateOpts): string[] {
  const files = parseFilesFromTemplate(template)
  for (const file of files) {
    const target = join(opts.root, file.path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, file.text)
  }
  return files.map((file) => file.path)
}
