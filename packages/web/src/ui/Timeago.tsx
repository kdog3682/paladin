function timeago(timestamp: number | string | Date) {
  const then = new Date(timestamp).getTime()
  const now = Date.now()
  const diff = Math.floor((now - then) / 1000)

  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.345, "week"],
    [12, "month"],
    [Infinity, "year"],
  ]

  let value = diff
  let unit = "second"

  for (const [amount, name] of units) {
    if (value < amount) {
      unit = name
      break
    }
    value = Math.floor(value / amount)
  }

  const rounded = Math.round(value)
  const suffix = rounded === 1 ? unit : `${unit}s`
  return `${rounded} ${suffix} ago`
}

export function Timeago({ timestamp }: { timestamp: number | string | Date }) {
  return <span>{timeago(timestamp)}</span>
}

function Demo() {
  const now = Date.now()
  const samples = [
    { label: "just now", ts: now - 5 * 1000 },
    { label: "5 min ago", ts: now - 5 * 60 * 1000 },
    { label: "3 hours ago", ts: now - 3 * 60 * 60 * 1000 },
    { label: "2 days ago", ts: now - 2 * 24 * 60 * 60 * 1000 },
    { label: "1 year ago", ts: now - 365 * 24 * 60 * 60 * 1000 },
  ]

  return (
    <div className="flex flex-col gap-2 p-6 font-sans text-sm">
      {samples.map((s) => (
        <div key={s.label} className="flex justify-between gap-4 border-b pb-1">
          <span className="text-muted-foreground">{s.label}</span>
          <Timeago timestamp={s.ts} />
        </div>
      ))}
    </div>
  )
}

export default Demo
