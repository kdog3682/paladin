// @paladin/json-viewer-frontend/src/theme.ts

export interface JsonTheme {
  // page
  bg: string
  text: string
  headerBg: string
  headerBorder: string

  // syntax
  key: string
  string: string
  number: string
  boolean: string
  null: string
  bracket: string
  comma: string

  // block (long values)
  blockBg: string
  blockBorder: string

  // collapse toggle
  toggle: string
  toggleHover: string
  collapsedCount: string

  // tree guide line
  treeLine: string

  // fzf picker
  fzfOverlay: string
  fzfBg: string
  fzfBorder: string
  fzfInputBg: string
  fzfInputBorder: string
  fzfText: string
  fzfMuted: string
  fzfActiveItem: string
  fzfActiveText: string

  // shiki theme name
  shikiTheme: string
}

export const lightTheme: JsonTheme = {
  bg: "bg-white",
  text: "text-zinc-800",
  headerBg: "bg-white/90",
  headerBorder: "border-zinc-200",

  key: "text-indigo-600",
  string: "text-orange-600",
  number: "text-emerald-600",
  boolean: "text-amber-600",
  null: "text-zinc-400",
  bracket: "text-zinc-500",
  comma: "text-zinc-400",

  blockBg: "bg-zinc-50",
  blockBorder: "border-zinc-200",

  toggle: "text-zinc-400",
  toggleHover: "hover:text-zinc-600",
  collapsedCount: "text-zinc-400",

  treeLine: "border-zinc-200",

  fzfOverlay: "bg-black/30",
  fzfBg: "bg-white",
  fzfBorder: "border-zinc-200",
  fzfInputBg: "bg-zinc-50",
  fzfInputBorder: "border-zinc-300",
  fzfText: "text-zinc-800",
  fzfMuted: "text-zinc-400",
  fzfActiveItem: "bg-indigo-50",
  fzfActiveText: "text-indigo-700",

  shikiTheme: "github-light",
}

export const darkTheme: JsonTheme = {
  bg: "bg-zinc-950",
  text: "text-zinc-200",
  headerBg: "bg-zinc-950/90",
  headerBorder: "border-zinc-800",

  key: "text-sky-300",
  string: "text-orange-300",
  number: "text-emerald-400",
  boolean: "text-amber-400",
  null: "text-zinc-500",
  bracket: "text-zinc-400",
  comma: "text-zinc-600",

  blockBg: "bg-zinc-800/60",
  blockBorder: "border-zinc-700/50",

  toggle: "text-zinc-500",
  toggleHover: "hover:text-zinc-300",
  collapsedCount: "text-zinc-600",

  treeLine: "border-zinc-800",

  fzfOverlay: "bg-black/60",
  fzfBg: "bg-zinc-900",
  fzfBorder: "border-zinc-700",
  fzfInputBg: "bg-zinc-800",
  fzfInputBorder: "border-zinc-600",
  fzfText: "text-zinc-300",
  fzfMuted: "text-zinc-500",
  fzfActiveItem: "bg-sky-600/20",
  fzfActiveText: "text-sky-300",

  shikiTheme: "github-dark",
}
