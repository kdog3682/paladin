/* src/types.ts */

/// untouched
export type Row = { label: string; value: string }

/* src/format.ts */

/// untouched, still reached from src/format-row.ts
export function pad(value: string, width: number) {
	return value.padEnd(width, " ")
}

/* src/report.ts */

import type { Row } from "./types"
/// date-fns went with header, ./format went with formatRow, both dropped as unused
import { buildReport } from "./report/build"
/// each extraction appends its import back at the end of the import block
import { formatReportRow } from "./format-row"

/// WIDTH travelled with formatRow, nothing else referenced it
export function summarize(rows: Row[]) {
	return rows.map(formatReportRow).join(", ")
}

export function printReport(rows: Row[]) {
	console.log(buildReport(rows, new Date()))
}

/* src/report/build.ts */

/// new file, imports are emitted in the order the moved code reaches them
import { format } from "date-fns"
import type { Row } from "../types"
/// formatRow stayed behind in the first pass, so it was imported back in as a shared dep,
/// then redirected here when the second pass moved it
import { formatReportRow } from "../format-row"

/// header moved along, it was only ever referenced by buildReport
function header(at: Date) {
	return format(at, "yyyy-MM-dd")
}

export function buildReport(rows: Row[], at: Date) {
	return [header(at), ...rows.map(formatReportRow)].join("\n")
}

/* src/format-row.ts */

import type { Row } from "./types"
import { pad } from "./format"

/// moved deps keep their visibility, only the extracted symbol is exported
const WIDTH = 24

/// renamed before the move, so every reference in the project already reads the new name
export function formatReportRow(row: Row) {
	return pad(row.label, WIDTH) + row.value
}

/* src/index.ts */

/// redirected to the new home rather than re-exported from src/report.ts
import { buildReport } from "./report/build"
import type { Row } from "./types"

const rows: Row[] = [{ label: "total", value: "12" }]

console.log(buildReport(rows, new Date()))

/* src/multi.ts */

/// inner is only referenced from other now that outer moved out, so the import
/// that extracting outer added back for it is still needed
import { inner } from "./multi.moved"

export function other(x: number) {
	return inner(x) * 2
}

/* src/multi.moved.ts */

/// regression case: extracting outer first pulls inner in as a shared import
/// (`import { inner } from "./multi"`) because inner is still referenced elsewhere
/// in src/multi.ts at that point. Extracting inner next moves its declaration into
/// this same file - redirectImports must drop that now-self-referential import
/// instead of leaving it behind or re-pointing it at itself.
export function outer(x: number) {
	return inner(x) + 1
}

export function inner(x: number) {
	return x + 1
}
