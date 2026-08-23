/* src/geometry.ts */

/// deleted: both exports relocated to their only consumer, leaving no exports and no statements

/* src/theme.ts */

/// GRID_GAP relocated to layout.ts, PANEL_BACKGROUND relocated to canvas.ts and then inlined there
/// Z_INDEX_OVERLAY stays exported: two files consume it, so it has no single owner
export const Z_INDEX_OVERLAY = 300

/* src/canvas.ts */

/// both imports are gone: every name they provided was moved into this file
/// PANEL_BACKGROUND arrived from theme.ts, then the local pass inlined it (single use)
/// DEFAULT_RADIUS arrived from geometry.ts, then the local pass inlined it (single use)
/// SEGMENT_COUNT arrived from geometry.ts and stays as a declaration: two uses, above the inline threshold
const SEGMENT_COUNT = 64

type Ctx = {
  lineWidth: number
  fillStyle: string
  arc: (x: number, y: number, radius: number, start: number, end: number) => void
}

/// STROKE_WIDTH, ORIGIN_X and ORIGIN_Y are gone: single use each, simple literals
/// PALETTE stays: an object literal is not a simple string or number
const PALETTE = { primary: "#0099ff", accent: "#ff9900" }

export function drawCircle(ctx: Ctx) {
  /// assignment target names the value, so no comment is needed
  ctx.lineWidth = 2
  ctx.fillStyle = PALETTE.primary
  /// positional arguments name nothing, so each inlined value keeps its constant name as a comment
  ctx.arc(/* ORIGIN_X */ 0, /* ORIGIN_Y */ 0, /* DEFAULT_RADIUS */ 12, 0, Math.PI * 2)
}

export function tessellate() {
  return {
    /// property key names the value, so no comment is needed
    background: "#101014",
    segments: SEGMENT_COUNT,
    step: (Math.PI * 2) / SEGMENT_COUNT,
  }
}

/* src/layout.ts */

import { Z_INDEX_OVERLAY } from "./theme"

/// GRID_GAP moved here as a non-exported const: this was its only consumer, but two uses means no inlining
const GRID_GAP = 8

export function gridStyle() {
  return { gap: GRID_GAP, padding: GRID_GAP * 2, zIndex: Z_INDEX_OVERLAY }
}

/* src/overlay.ts */

/// unchanged
import { Z_INDEX_OVERLAY } from "./theme"

export function overlayStyle() {
  return { zIndex: Z_INDEX_OVERLAY }
}
