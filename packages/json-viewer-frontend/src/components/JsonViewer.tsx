// @paladin/json-viewer-frontend/src/components/JsonViewer.tsx

import { useEffect, useRef } from "react"
import { useStore } from "../store"
import { JsonKey } from "./JsonKey"
import { JsonValue } from "./JsonValue"
import {
  useNavStore,
  isCollapsed as checkCollapsed,
  isCursorAt,
  type PathSegment,
} from "../hooks/useNavigation"

interface JsonNodeProps {
  data: unknown
  depth?: number
  label?: string
  path: PathSegment[]
}

function CollapsibleNode({
  label,
  openBracket,
  closeBracket,
  children,
  count,
  path,
}: {
  label?: string
  openBracket: string
  closeBracket: string
  children: React.ReactNode
  count: number
  path: PathSegment[]
}) {
  const t = useStore((s) => s.theme)
  const collapsed = useNavStore((s) => checkCollapsed(s.collapsed, path))
  const isCursor = useNavStore((s) => isCursorAt(s.cursor, path))
  const setCursor = useNavStore((s) => s.setCursor)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isCursor && ref.current) {
      ref.current.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }
  }, [isCursor])

  return (
    <div
      ref={ref}
      className={`leading-relaxed rounded-sm ${isCursor ? "ring-2 ring-indigo-400/50 bg-indigo-50/50 dark:bg-indigo-900/20" : ""}`}
      onClick={(e) => {
        e.stopPropagation()
        setCursor(path)
      }}
    >
      <span>
        {label && <JsonKey name={label} />}
        <span className={t.bracket}>{openBracket}</span>
        {collapsed && (
          <span className={`${t.collapsedCount} text-xs ml-1`}>
            {count} {count === 1 ? "item" : "items"}
          </span>
        )}
        {collapsed && <span className={t.bracket}>{closeBracket}</span>}
      </span>
      {!collapsed && (
        <>
          <div className={`border-l ${t.treeLine} ml-2`}>{children}</div>
          <div>
            <span className={t.bracket}>{closeBracket}</span>
          </div>
        </>
      )}
    </div>
  )
}

export function JsonNode({ data, depth = 0, label, path }: JsonNodeProps) {
  const t = useStore((s) => s.theme)
  const isCursor = useNavStore((s) => isCursorAt(s.cursor, path))
  const setCursor = useNavStore((s) => s.setCursor)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (isCursor && ref.current) {
      ref.current.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }
  }, [isCursor])

  if (data === null || typeof data !== "object") {
    return (
      <span
        ref={ref}
        className={`rounded-sm ${isCursor ? "ring-2 ring-indigo-400/50 bg-indigo-50/50 dark:bg-indigo-900/20" : ""}`}
        onClick={(e) => {
          e.stopPropagation()
          setCursor(path)
        }}
      >
        {label && <JsonKey name={label} />}
        <JsonValue value={data as string | number | boolean | null} />
      </span>
    )
  }

  if (Array.isArray(data)) {
    return (
      <CollapsibleNode
        label={label}
        openBracket="["
        closeBracket="]"
        count={data.length}
        path={path}
      >
        {data.map((item, i) => (
          <div key={i} className="pl-4">
            <JsonNode data={item} depth={depth + 1} path={[...path, i]} />
            {i < data.length - 1 && <span className={t.comma}>,</span>}
          </div>
        ))}
      </CollapsibleNode>
    )
  }

  const entries = Object.entries(data)

  return (
    <CollapsibleNode
      label={label}
      openBracket="{"
      closeBracket="}"
      count={entries.length}
      path={path}
    >
      {entries.map(([key, val], i) => (
        <div key={key} className="pl-4">
          <JsonNode data={val} depth={depth + 1} label={key} path={[...path, key]} />
          {i < entries.length - 1 && <span className={t.comma}>,</span>}
        </div>
      ))}
    </CollapsibleNode>
  )
}
