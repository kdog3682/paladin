/* src/geometry.ts */

export const DEFAULT_RADIUS = 12
export const SEGMENT_COUNT = 64

/* src/theme.ts */

export const GRID_GAP = 8
export const PANEL_BACKGROUND = "#101014"
export const Z_INDEX_OVERLAY = 300

/* src/canvas.ts */

import { DEFAULT_RADIUS, SEGMENT_COUNT } from "./geometry"
import { PANEL_BACKGROUND } from "./theme"

type Ctx = {
  lineWidth: number
  fillStyle: string
  arc: (x: number, y: number, radius: number, start: number, end: number) => void
}

const STROKE_WIDTH = 2
const ORIGIN_X = 0
const ORIGIN_Y = 0
const PALETTE = { primary: "#0099ff", accent: "#ff9900" }

export function drawCircle(ctx: Ctx) {
  ctx.lineWidth = STROKE_WIDTH
  ctx.fillStyle = PALETTE.primary
  ctx.arc(ORIGIN_X, ORIGIN_Y, DEFAULT_RADIUS, 0, Math.PI * 2)
}

export function tessellate() {
  return {
    background: PANEL_BACKGROUND,
    segments: SEGMENT_COUNT,
    step: (Math.PI * 2) / SEGMENT_COUNT,
  }
}

/* src/layout.ts */

import { GRID_GAP, Z_INDEX_OVERLAY } from "./theme"

export function gridStyle() {
  return { gap: GRID_GAP, padding: GRID_GAP * 2, zIndex: Z_INDEX_OVERLAY }
}

/* src/overlay.ts */

import { Z_INDEX_OVERLAY } from "./theme"

export function overlayStyle() {
  return { zIndex: Z_INDEX_OVERLAY }
}
