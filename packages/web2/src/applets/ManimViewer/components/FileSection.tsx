import type { ExampleFile } from "../lib/examples"
import { ExampleCard } from "./ExampleCard"

type Props = {
  file: ExampleFile
  zoom: number
}

/** a file's examples under its path */
export function FileSection({ file, zoom }: Props) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-sm text-neutral-500">
        {file.path} <span className="text-neutral-400">· {file.examples.length}</span>
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] items-start gap-4">
        {file.examples.map((example) => (
          <ExampleCard key={example.id} example={example} zoom={zoom} />
        ))}
      </div>
    </section>
  )
}
