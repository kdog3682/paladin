/** every `*.examples.ts` under the manim package, found without importing any of them */
const SOURCES = import.meta.glob("../../../../../../mathpen/packages/manim/src/**/*.examples.ts", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>

const MODULES = import.meta.glob("../../../../../../mathpen/packages/manim/src/**/*.examples.ts") as Record<
  string,
  () => Promise<Record<string, unknown>>
>

export type Example = {
  id: string
  name: string
  /** the `/* ... *\/` comment right above the export */
  doc: string
  run: () => Promise<unknown>
}

export type ExampleFile = {
  /** path under manim/src, e.g. `geometry/line.examples.ts` */
  path: string
  examples: Example[]
}

const ROOT = "mathpen/packages/manim/src/"

// a zero-arg exported function, optionally preceded by a block comment. the
// same rule the mathpen-check cli uses to decide what counts as an example
const EXAMPLE = /(?:\/\*+((?:(?!\*\/)[\s\S])*?)\*+\/\s*)?export (?:async )?function (\w+)\(\)/g

function tidy(comment: string): string {
  return comment
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

export async function loadExampleFiles(): Promise<ExampleFile[]> {
  const files = await Promise.all(
    Object.keys(SOURCES).map(async (key): Promise<ExampleFile> => {
      const path = key.slice(key.indexOf(ROOT) + ROOT.length)
      const source = await SOURCES[key]!()
      const examples = [...source.matchAll(EXAMPLE)].map(([, doc, name]): Example => ({
        id: `${path}#${name}`,
        name: name!,
        doc: doc ? tidy(doc) : "",
        run: async () => {
          const mod = await MODULES[key]!()
          return (mod[name!] as () => unknown)()
        },
      }))
      return { path, examples }
    }),
  )
  return files.filter((f) => f.examples.length > 0).sort((a, b) => a.path.localeCompare(b.path))
}
