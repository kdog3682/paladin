import type { Length, Unit } from "../model/types"

/* theme tokens, mapped to shadcn css vars */
export const THEME_COLORS = [
  "background",
  "foreground",
  "primary",
  "secondary",
  "muted",
  "accent",
  "destructive",
  "border",
  "card",
]

const NUM = /^(\d+(?:\.\d+)?)(p|%|px)?$/

export type Fixed = { n: number, unit: Unit }

export function isLength(v: unknown): v is Fixed {
  return typeof v === "object" && v !== null && "n" in v && "unit" in v
}

export function px(n: number): Fixed {
  return { n, unit: "px" }
}

export function pct(n: number): Fixed {
  return { n, unit: "%" }
}

/* "20" → 20px, "20p" / "20%" → 20%, keywords pass through */
export function parseLength(raw: string, units: Unit[], keywords: string[] = []): Length | undefined {
  if (keywords.includes(raw)) return raw as Length
  const m = NUM.exec(raw)
  if (!m) return undefined
  const unit: Unit = m[2] === "p" || m[2] === "%" ? "%" : "px"
  if (!units.includes(unit)) return undefined
  return { n: Number(m[1]), unit }
}

export function parseNumber(raw: string): number | undefined {
  if (!/^\d+(\.\d+)?$/.test(raw)) return undefined
  return Number(raw)
}

export function parseBool(raw: string): boolean | undefined {
  if (raw === "" || raw === "on" || raw === "true") return true
  if (raw === "off" || raw === "false") return false
  return undefined
}

export function parseColor(raw: string): string | undefined {
  if (!raw) return undefined
  if (THEME_COLORS.includes(raw)) return raw
  if (/^#[0-9a-f]{3,8}$/i.test(raw)) return raw
  if (/^(rgb|rgba|hsl|hsla|oklch|oklab)\(.*\)$/i.test(raw)) return raw
  if (/^[a-z]+$/i.test(raw)) return raw
  return undefined
}

export function colorCss(v: string): string {
  return THEME_COLORS.includes(v) ? `var(--${v})` : v
}

export function lengthCss(v: Fixed): string {
  return v.unit === "%" ? `${v.n}%` : `${v.n}px`
}

export function round(n: number): number {
  return Math.round(n * 100) / 100
}
