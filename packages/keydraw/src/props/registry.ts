import type { CSSProperties } from "react"
import type { Layout, Props, Unit } from "../model/types"
import {
  THEME_COLORS,
  colorCss,
  isLength,
  lengthCss,
  parseBool,
  parseColor,
  parseLength,
  parseNumber,
} from "./parse"
import { FLEX_ALIGN, FLEX_ITEMS, SHADOWS, TEXT_SIZES } from "./presets"

export type PropKind = "length" | "number" | "color" | "enum" | "bool" | "preset"

export type Pad = { l: number, r: number, t: number, b: number }

export type CssCtx = {
  /* layout of the parent node; the artboard root gets "root" */
  parentLayout: Layout | "root"
  /* flex direction of the parent (row unless flex:dir col) */
  parentDir: "row" | "col"
  /* resolved px padding of the parent, so % sizes in absolute parents use the content box */
  parentPad: Pad
}

export type PropDef = {
  /* canonical name, e.g. "padding" */
  name: string
  /* short tokens, e.g. ["p"]; the first alias is used when formatting tokens */
  aliases: string[]
  kind: PropKind
  /* allowed units for length props */
  units?: Unit[]
  /* enum/preset values for autocomplete and Space-cycling.
     enum, bool, preset and color props are toggleable */
  values?: string[]
  /* extra words accepted by length props, e.g. fill and hug */
  keywords?: string[]
  parse: (raw: string) => unknown
  toCss: (v: unknown, ctx: CssCtx) => CSSProperties
}

type CssKey = keyof CSSProperties

/* computed-key css objects */
const css = (entries: [string, string | number][]): CSSProperties => Object.fromEntries(entries) as CSSProperties

function lengthProp(name: string, aliases: string[], keys: CssKey[], units: Unit[] = ["px"]): PropDef {
  return {
    name,
    aliases,
    kind: "length",
    units,
    parse: raw => parseLength(raw, units),
    toCss: v => (isLength(v) ? css(keys.map(k => [k, lengthCss(v)])) : {}),
  }
}

function padCalc(n: number, ctx: CssCtx, axis: "width" | "height"): string {
  const p = axis === "width" ? ctx.parentPad.l + ctx.parentPad.r : ctx.parentPad.t + ctx.parentPad.b
  return p ? `calc((100% - ${p}px) * ${n / 100})` : `${n}%`
}

function sizeProp(name: "width" | "height", alias: string): PropDef {
  const axis = name === "width" ? "row" : "col"
  const minKey = name === "width" ? "minWidth" : "minHeight"
  return {
    name,
    aliases: [alias],
    kind: "length",
    units: ["px", "%"],
    keywords: ["fill", "hug"],
    parse: raw => parseLength(raw, ["px", "%"], ["fill", "hug"]),
    toCss: (v, ctx) => {
      if (v === "hug") return css([[name, "fit-content"]])
      if (v === "fill") {
        if (ctx.parentLayout === "flex") return ctx.parentDir === axis ? css([["flex", "1 1 0"], [minKey, 0]]) : { alignSelf: "stretch" }
        if (ctx.parentLayout === "absolute") return css([[name, padCalc(100, ctx, name)]])
        return css([[name, "100%"]])
      }
      if (!isLength(v)) return {}
      if (v.unit === "%" && ctx.parentLayout === "absolute") return css([[name, padCalc(v.n, ctx, name)]])
      return css([[name, lengthCss(v)]])
    },
  }
}

function posProp(name: "x" | "y", key: "left" | "top"): PropDef {
  return {
    name,
    aliases: [name],
    kind: "length",
    units: ["px"],
    parse: raw => parseLength(raw, ["px"]),
    toCss: (v, ctx) => (ctx.parentLayout === "absolute" && isLength(v) ? css([[key, lengthCss(v)]]) : {}),
  }
}

function numberProp(name: string, aliases: string[], css: (n: number) => CSSProperties): PropDef {
  return {
    name,
    aliases,
    kind: "number",
    parse: parseNumber,
    toCss: v => (typeof v === "number" ? css(v) : {}),
  }
}

function enumProp(name: string, aliases: string[], values: string[], css: (v: string) => CSSProperties): PropDef {
  return {
    name,
    aliases,
    kind: "enum",
    values,
    parse: raw => (raw === "" ? values[0] : values.includes(raw) ? raw : undefined),
    toCss: v => (typeof v === "string" ? css(v) : {}),
  }
}

function boolProp(name: string, aliases: string[], css: (v: boolean) => CSSProperties): PropDef {
  return {
    name,
    aliases,
    kind: "bool",
    parse: parseBool,
    toCss: v => (typeof v === "boolean" ? css(v) : {}),
  }
}

function colorProp(name: string, aliases: string[], key: CssKey): PropDef {
  return {
    name,
    aliases,
    kind: "color",
    values: THEME_COLORS,
    parse: parseColor,
    toCss: v => (typeof v === "string" ? css([[key, colorCss(v)]]) : {}),
  }
}

/* order matters: later entries override earlier css keys (p, then px, then pt) */
export const PROPS: PropDef[] = [
  lengthProp("padding", ["p"], ["padding"]),
  lengthProp("paddingX", ["px"], ["paddingLeft", "paddingRight"]),
  lengthProp("paddingY", ["py"], ["paddingTop", "paddingBottom"]),
  lengthProp("paddingTop", ["pt"], ["paddingTop"]),
  lengthProp("paddingRight", ["pr"], ["paddingRight"]),
  lengthProp("paddingBottom", ["pb"], ["paddingBottom"]),
  lengthProp("paddingLeft", ["pl"], ["paddingLeft"]),
  sizeProp("width", "w"),
  sizeProp("height", "h"),
  posProp("x", "left"),
  posProp("y", "top"),
  lengthProp("radius", ["r"], ["borderRadius"], ["px", "%"]),
  lengthProp("gap", ["gap"], ["gap"]),
  colorProp("bg", ["bg"], "background"),
  colorProp("fg", ["fg"], "color"),
  {
    name: "border",
    aliases: ["border", "bd"],
    kind: "length",
    units: ["px"],
    parse: raw => parseLength(raw, ["px"]),
    toCss: v => (isLength(v) ? { border: `${v.n}px solid var(--border)` } : {}),
  },
  numberProp("opacity", ["op"], n => ({ opacity: n / 100 })),
  numberProp("z", ["z"], n => ({ zIndex: n })),
  {
    name: "shadow",
    aliases: ["shadow"],
    kind: "preset",
    values: ["base", "sm", "md", "lg", "none"],
    parse: raw => (raw === "" ? "base" : raw in SHADOWS ? raw : undefined),
    toCss: v => (typeof v === "string" ? { boxShadow: SHADOWS[v] } : {}),
  },
  enumProp("layout", ["layout"], ["absolute", "flex", "grid"], () => ({})),
  enumProp("flexDir", ["flex:dir"], ["row", "col"], v => ({ flexDirection: v === "col" ? "column" : "row" })),
  enumProp("flexAlign", ["flex:align"], Object.keys(FLEX_ALIGN), v => ({ justifyContent: FLEX_ALIGN[v] })),
  enumProp("flexItems", ["flex:items"], Object.keys(FLEX_ITEMS), v => ({ alignItems: FLEX_ITEMS[v] })),
  boolProp("flexWrap", ["flex:wrap"], v => ({ flexWrap: v ? "wrap" : "nowrap" })),
  numberProp("gridCols", ["grid:cols"], n => ({ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` })),
  numberProp("gridRows", ["grid:rows"], n => ({ gridTemplateRows: `repeat(${n}, minmax(0, 1fr))` })),
  numberProp("spanCol", ["span:col"], n => ({ gridColumn: `span ${n}` })),
  numberProp("spanRow", ["span:row"], n => ({ gridRow: `span ${n}` })),
  enumProp("textSize", ["text"], Object.keys(TEXT_SIZES), v => ({ fontSize: TEXT_SIZES[v] })),
  boolProp("bold", ["bold"], v => ({ fontWeight: v ? 700 : 400 })),
  enumProp("textAlign", ["align"], ["left", "center", "right"], v => ({ textAlign: v as CSSProperties["textAlign"] })),
]

export const byName = new Map(PROPS.map(d => [d.name, d]))

/* aliases and canonical names → def */
export const byAlias = new Map<string, PropDef>()
for (const d of PROPS) {
  for (const a of d.aliases) byAlias.set(a, d)
  if (!byAlias.has(d.name)) byAlias.set(d.name, d)
}

/* props that move to the shared parent when several siblings are selected */
export const PARENT_ROUTED = new Set(["layout", "flexDir", "flexAlign", "flexItems", "flexWrap"])
export const IMPLIES_FLEX = new Set(["flexDir", "flexAlign", "flexItems", "flexWrap"])
export const IMPLIES_GRID = new Set(["gridCols", "gridRows"])

export function isToggleable(d: PropDef): boolean {
  return d.kind === "enum" || d.kind === "bool" || d.kind === "preset" || d.kind === "color"
}

export function isNumeric(d: PropDef): boolean {
  return d.kind === "length" || d.kind === "number"
}

export function cycleValues(d: PropDef): string[] {
  if (d.kind === "bool") return ["on", "off"]
  if (d.kind === "color") return THEME_COLORS
  return d.values ?? []
}

/* the cycle-position key of a parsed value */
export function valueKey(d: PropDef, v: unknown): string {
  if (d.kind === "bool") return v ? "on" : "off"
  return String(v)
}

export function formatValue(d: PropDef, v: unknown): string {
  if (isLength(v)) return lengthCss(v)
  if (d.kind === "bool") return v ? "on" : "off"
  return String(v)
}

/* the token form of a value, e.g. padding 4px → p4, width 20% → w20p */
export function formatToken(d: PropDef, v: unknown): string {
  const a = d.aliases[0]
  if (isLength(v)) return `${a}${v.n}${v.unit === "%" ? "p" : ""}`
  if (typeof v === "number") return `${a}:${v}`
  if (d.kind === "bool") return v ? a : `${a}:off`
  return `${a}:${String(v)}`
}

export function padOf(props: Props): Pad {
  const n = (k: string) => {
    const v = props[k]
    return isLength(v) && v.unit === "px" ? v.n : undefined
  }
  const all = n("padding") ?? 0
  const x = n("paddingX") ?? all
  const y = n("paddingY") ?? all
  return {
    l: n("paddingLeft") ?? x,
    r: n("paddingRight") ?? x,
    t: n("paddingTop") ?? y,
    b: n("paddingBottom") ?? y,
  }
}
