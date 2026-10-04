import { useEffect, useMemo, useState } from "react"
import "./index.css"
import { FileSection } from "./components/FileSection"
import { Header } from "./components/Header"
import { loadExampleFiles, type ExampleFile } from "./lib/examples"
import { loadFonts } from "./lib/fonts"

/** a gallery of every `*.examples.ts` export in the manim package, drawn on canvas */
export default function App() {
  const [files, setFiles] = useState<ExampleFile[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    Promise.all([loadExampleFiles(), loadFonts()]).then(
      ([found]) => {
        setFiles(found)
        setReady(true)
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    )
  }, [])

  const total = useMemo(() => files.reduce((n, f) => n + f.examples.length, 0), [files])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return files
    return files
      .map((file) => ({
        ...file,
        examples: file.examples.filter(
          (e) => file.path.toLowerCase().includes(q) || e.name.toLowerCase().includes(q) || e.doc.toLowerCase().includes(q),
        ),
      }))
      .filter((file) => file.examples.length > 0)
  }, [files, query])

  const shown = visible.reduce((n, f) => n + f.examples.length, 0)

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      <Header query={query} onQuery={setQuery} zoom={zoom} onZoom={setZoom} shown={shown} total={total} />

      <main className="flex flex-col gap-8 p-6">
        {error ? (
          <pre className="whitespace-pre-wrap font-mono text-sm text-red-600">{error}</pre>
        ) : !ready ? (
          <p className="text-sm text-neutral-400">loading fonts and examples…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-neutral-400">no examples match “{query}”</p>
        ) : (
          visible.map((file) => <FileSection key={file.path} file={file} zoom={zoom} />)
        )}
      </main>
    </div>
  )
}
