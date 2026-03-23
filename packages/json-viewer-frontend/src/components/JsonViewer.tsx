// @paladin/json-viewer-frontend/src/components/JsonViewer.tsx

import { useState } from "react"
import { useStore } from "../store"
import { JsonKey } from "./JsonKey"
import { JsonValue } from "./JsonValue"

interface JsonNodeProps {
  data: unknown
  depth?: number
  label?: string
}

function CollapsibleNode({
  label,
  openBracket,
  closeBracket,
  children,
  count,
}: {
  label?: string
  openBracket: string
  closeBracket: string
  children: React.ReactNode
  count: number
}) {
  const [collapsed, setCollapsed] = useState(false)
  const t = useStore((s) => s.theme)

  return (
    <div className="leading-relaxed">
      <span>
        {label && <JsonKey name={label} />}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`${t.toggle} ${t.toggleHover} cursor-pointer select-none`}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <span className={t.bracket}> {openBracket}</span>
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

export function JsonNode({ data, depth = 0, label }: JsonNodeProps) {
  const t = useStore((s) => s.theme)

  if (data === null || typeof data !== "object") {
    return (
      <span>
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
      >
        {data.map((item, i) => (
          <div key={i} className="pl-4">
            <JsonNode data={item} depth={depth + 1} />
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
    >
      {entries.map(([key, val], i) => (
        <div key={key} className="pl-4">
          <JsonNode data={val} depth={depth + 1} label={key} />
          {i < entries.length - 1 && <span className={t.comma}>,</span>}
        </div>
      ))}
    </CollapsibleNode>
  )
}
