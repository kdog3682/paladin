import { useState } from "react"

export function Counter({ label = "Count", start = 0 }: { label?: string; start?: number }) {
  const [n, setN] = useState(start)
  return (
    <button onClick={() => setN(n + 1)} className="rounded bg-blue-600 px-3 py-1 text-white">
      {label}: {n}
    </button>
  )
}
