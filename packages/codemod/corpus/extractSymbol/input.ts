/*
- command: extractSymbol, args: ['src/report.ts', 'buildReport', './report/build.ts']
- command: extractSymbol, args: ['src/report.ts', 'formatRow', './format-row.ts', 'formatReportRow']
*/

/* src/types.ts */

export type Row = { label: string; value: string }

/* src/format.ts */

export function pad(value: string, width: number) {
	return value.padEnd(width, " ")
}

/* src/report.ts */

import { format } from "date-fns"
import { pad } from "./format"
import type { Row } from "./types"

const WIDTH = 24

function header(at: Date) {
	return format(at, "yyyy-MM-dd")
}

function formatRow(row: Row) {
	return pad(row.label, WIDTH) + row.value
}

export function buildReport(rows: Row[], at: Date) {
	return [header(at), ...rows.map(formatRow)].join("\n")
}

export function summarize(rows: Row[]) {
	return rows.map(formatRow).join(", ")
}

export function printReport(rows: Row[]) {
	console.log(buildReport(rows, new Date()))
}

/* src/index.ts */

import { buildReport } from "./report"
import type { Row } from "./types"

const rows: Row[] = [{ label: "total", value: "12" }]

console.log(buildReport(rows, new Date()))
