export type Action = {
  /* codemod to run, ie the basename of src/codemods/<action>.ts */
  action: string
  /* positional arguments, passed after the project */
  args?: unknown[]
}

export type Spec = {
  /* project to run against: `repo/pkg`, `~/foo`, `./src`, defaults to cwd */
  dir?: string
  actions: Action[]
  /* report what would change without writing */
  dry?: boolean
  /* load only these files (relative to dir, or absolute) instead of every source file under dir */
  files?: string[]
}

export type Codemod = (project: import('ts-morph').Project, ...args: unknown[]) => unknown

export type CorpusFile = {
  /* path relative to the fixture root, ie `src/foo.ts` */
  path: string
  code: string
}

export type Corpus = {
  name: string
  /* actions from the input preamble; empty when the fixture is named after a codemod */
  actions: Action[]
  input: CorpusFile[]
  /* empty when output.ts is a data corpus (see `data`) */
  expected: CorpusFile[]
  /* set when output.ts is `export default { data }` instead of a set of files: the codemod's
     return value is compared against `data.value`, rather than diffing files. wrapped so an
     expected value of `undefined` is still distinguishable from "no data corpus". */
  data?: { value: unknown }
}

export type FileResult = {
  path: string
  /* pass | changed | missing | unexpected | error: ... */
  status: string
  diff?: string[]
}

export type Summary = {
  corpus: string
  codemods: string[]
  pass: boolean
  passed: number
  failed: number
  legend: string
  files: FileResult[]
}
