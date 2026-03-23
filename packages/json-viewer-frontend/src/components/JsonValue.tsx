// @paladin/json-viewer-frontend/src/components/JsonValue.tsx

import { useEffect, useRef } from "react"
import { codeToHtml } from "shiki"
import { useStore } from "../store"

const BLOCK_THRESHOLD = 50

interface JsonValueProps {
  value: string | number | boolean | null
}

function ShikiBlock({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const shikiTheme = useStore((s) => s.theme.shikiTheme)
  const t = useStore((s) => s.theme)

  useEffect(() => {
    let cancelled = false

    // try to detect language from content
    const lang = detectLang(text)

    codeToHtml(text, { lang, theme: shikiTheme }).then((html) => {
      if (!cancelled && ref.current) {
        ref.current.innerHTML = html
      }
    })

    return () => {
      cancelled = true
    }
  }, [text, shikiTheme])

  return (
    <div
      ref={ref}
      className={`mt-1 mb-1 rounded-md ${t.blockBg} px-3 py-2 border ${t.blockBorder} text-sm leading-relaxed overflow-x-auto [&_pre]:!bg-transparent [&_pre]:!p-0 [&_pre]:!m-0`}
    />
  )
}

function detectLang(text: string): string {
  const trimmed = text.trim()
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json"
  if (trimmed.startsWith("<") && trimmed.includes(">")) return "html"
  if (trimmed.includes("function ") || trimmed.includes("const ") || trimmed.includes("=>")) return "javascript"
  if (trimmed.includes("def ") || trimmed.includes("import ")) return "python"
  return "text"
}

export function JsonValue({ value }: JsonValueProps) {
  const t = useStore((s) => s.theme)

  if (value === null) {
    return <span className={`${t.null} italic`}>null</span>
  }

  if (typeof value === "boolean") {
    return (
      <span className={`${t.boolean} font-medium`}>
        {value ? "true" : "false"}
      </span>
    )
  }

  if (typeof value === "number") {
    return <span className={t.number}>{value}</span>
  }

  const text = String(value)
  const isBlock = text.length > BLOCK_THRESHOLD

  if (isBlock) {
    return <ShikiBlock text={text} />
  }

  return <span className={t.string}>"{text}"</span>
}
