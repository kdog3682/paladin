import { listSessions, formatSessionList, inspect, formatReport, totalInput, cacheHitRate } from "./index"

const files = await listSessions()
console.log("recent sessions")
console.log(formatSessionList(files, 5))
console.log("")

// -1 is the latest conversation
const report = await inspect(1)
console.log(formatReport(report, { full: true }))
console.log("")

// programmatic access
const errors = report.toolCalls.filter((c) => c.isError)
console.log(`total input ${totalInput(report.totals)} · cache hit ${(cacheHitRate(report.totals) * 100).toFixed(1)}%`)
console.log(`errored tool calls: ${errors.map((c) => c.name).join(", ") || "none"}`)
