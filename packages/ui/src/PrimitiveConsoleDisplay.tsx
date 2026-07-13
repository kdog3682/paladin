import { useEffect, useRef, useState } from "react"

export interface ConsoleLogItem {
  title: string
  timestamp: number | string | Date
  body?: string
  labels?: string[]
  icon?: React.ReactNode
}

interface PrimitiveConsoleDisplayProps {
  logs: ConsoleLogItem[]
  onLogClick?: (log: ConsoleLogItem, index: number) => void
  onLogHover?: (log: ConsoleLogItem, index: number) => void
  itemPadding?: number
  bordered?: boolean
  className?: string
}

function Timeago({ timestamp }: { timestamp: number | string | Date }) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000))
  const label =
    seconds < 5 ? "just now" :
    seconds < 60 ? `${seconds}s ago` :
    seconds < 3600 ? `${Math.floor(seconds / 60)}m ago` :
    seconds < 86400 ? `${Math.floor(seconds / 3600)}h ago` :
    `${Math.floor(seconds / 86400)}d ago`

  return <span className="text-neutral-400 text-xs">{label}</span>
}

export function PrimitiveConsoleDisplay({
  logs,
  onLogClick,
  onLogHover,
  itemPadding = 12,
  bordered = false,
  className,
}: PrimitiveConsoleDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const logsKey = logs.map((log) => `${log.title}-${String(log.timestamp)}`).join("|")

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logsKey])

  return (
    <div
      ref={containerRef}
      className={`overflow-y-auto overflow-x-hidden bg-white text-neutral-800 ${bordered ? "border border-neutral-200 rounded-lg shadow-sm" : ""} ${className ?? ""}`}
    >
      {logs.map((log, i) => (
        <div
          key={i}
          onClick={() => onLogClick?.(log, i)}
          onMouseEnter={() => {
            setHoveredIndex(i)
            onLogHover?.(log, i)
          }}
          onMouseLeave={() => setHoveredIndex(null)}
          style={{ backgroundColor: hoveredIndex === i ? "#f5f5f5" : undefined }}
          className={`group relative transition-colors duration-150 ${onLogClick ? "cursor-pointer" : ""}`}
        >
          {i !== 0 && <div className="mx-3 border-t border-neutral-300" />}

          <div className="px-3" style={{ paddingTop: itemPadding, paddingBottom: itemPadding }}>
            <div className="flex items-start gap-2">
              {log.icon && <span className="shrink-0 mt-0.5">{log.icon}</span>}
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">{log.title}</div>
                <Timeago timestamp={log.timestamp} />

                {log.body && (
                  <p className="mt-1 text-xs text-neutral-500 line-clamp-2">{log.body}</p>
                )}

                {log.labels && log.labels.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {log.labels.map((label) => (
                      <span
                        key={label}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {log.body && (
              <div className="hidden group-hover:block absolute right-full top-2 mr-2 w-64 p-2 bg-white border border-neutral-200 rounded-md shadow-md text-xs text-neutral-700 z-10">
                {log.body}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function makeLog(i: number, secondsAgo: number): ConsoleLogItem {
  return {
    title: `deploy step ${i}`,
    timestamp: Date.now() - secondsAgo * 1000,
    body: `Ran task ${i} across all workers and waited for the health check to pass before continuing to the next stage of the rollout.`,
    labels: i % 2 === 0 ? ["info"] : ["info", "retry"],
  }
}

function Demo() {
  const [logs, setLogs] = useState<ConsoleLogItem[]>(() =>
    Array.from({ length: 10 }, (_, i) => makeLog(i + 1, (10 - i) * 30))
  )
  const [hovered, setHovered] = useState<number | null>(null)

  const pushMore = () => {
    setLogs((prev) => [...prev, makeLog(prev.length + 1, 0)])
  }

  return (
    <div className="p-4 max-w-sm mx-auto space-y-2">
      <PrimitiveConsoleDisplay
        logs={logs.slice(-5)}
        onLogClick={(log) => alert(log.title)}
        onLogHover={(_, i) => setHovered(i)}
        bordered
        className="h-64"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-400">hovered index: {hovered ?? "none"}</p>
        <button
          onClick={pushMore}
          className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 text-white hover:bg-neutral-700"
        >
          push log
        </button>
      </div>
    </div>
  )
}

export default Demo
