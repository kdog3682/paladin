type Props = {
  query: string
  onQuery: (query: string) => void
  zoom: number
  onZoom: (zoom: number) => void
  shown: number
  total: number
}

export function Header({ query, onQuery, zoom, onZoom, shown, total }: Props) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-neutral-200 bg-white/90 px-6 py-3 backdrop-blur">
      <span className="font-mono text-sm tracking-tight text-neutral-500">
        manim <span className="text-neutral-300">/</span> examples
      </span>

      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="filter by file, name or description"
        spellCheck={false}
        className="w-80 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-400"
      />

      <label className="flex items-center gap-2 text-xs text-neutral-500">
        zoom
        <input
          type="range"
          min={0.5}
          max={3}
          step={0.25}
          value={zoom}
          onChange={(e) => onZoom(Number(e.target.value))}
        />
        <span className="w-8 tabular-nums">{zoom}×</span>
      </label>

      <span className="ml-auto text-xs tabular-nums text-neutral-400">
        {shown} / {total}
      </span>
    </header>
  )
}
