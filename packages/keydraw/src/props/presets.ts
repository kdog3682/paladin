/* bare `shadow` is "base"; Space cycles base → sm → md → lg → none */
export const SHADOWS: Record<string, string> = {
  base: "0 1px 3px rgb(0 0 0 / 0.12), 0 1px 2px rgb(0 0 0 / 0.08)",
  sm: "0 1px 2px rgb(0 0 0 / 0.08)",
  md: "0 4px 8px -2px rgb(0 0 0 / 0.12), 0 2px 4px -2px rgb(0 0 0 / 0.08)",
  lg: "0 12px 24px -6px rgb(0 0 0 / 0.18), 0 4px 8px -4px rgb(0 0 0 / 0.1)",
  none: "none",
}

export const TEXT_SIZES: Record<string, number> = {
  sm: 12,
  md: 14,
  lg: 18,
  xl: 24,
}

export const FLEX_ALIGN: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  apart: "space-between",
  around: "space-around",
  evenly: "space-evenly",
}

export const FLEX_ITEMS: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
}
