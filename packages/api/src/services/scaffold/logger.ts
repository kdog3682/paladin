export type LogLevel = "debug" | "info" | "warn" | "error"
export type LogData = Record<string, unknown>

export interface LogEntry {
	level: LogLevel
	event: string
	message: string
	data?: LogData
	time: string
}

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const COLORS: Record<LogLevel, string> = {
	debug: "\x1b[90m",
	info: "\x1b[36m",
	warn: "\x1b[33m",
	error: "\x1b[31m",
}

const RESET = "\x1b[0m"
const DIM = "\x1b[2m"

const minLevel = (process.env.LOG_LEVEL as LogLevel) ?? "info"
const asJson = process.env.LOG_FORMAT === "json" || !process.stdout.isTTY

function write(level: LogLevel, event: string, message: string, data?: LogData) {
	if (LEVELS[level] < (LEVELS[minLevel] ?? LEVELS.info)) return

	const entry: LogEntry = { level, event, message, time: new Date().toISOString() }
	if (data && Object.keys(data).length > 0) entry.data = data

	const sink = level === "warn" || level === "error" ? console.error : console.log

	if (asJson) {
		sink(JSON.stringify(entry))
		return
	}

	const head = `${COLORS[level]}${level.padEnd(5)}${RESET} ${DIM}${event}${RESET}`
	const tail = entry.data ? ` ${DIM}${JSON.stringify(entry.data)}${RESET}` : ""
	sink(`${head} ${message}${tail}`)
}

export const logger = {
	debug: (event: string, message: string, data?: LogData) => write("debug", event, message, data),
	info: (event: string, message: string, data?: LogData) => write("info", event, message, data),
	warn: (event: string, message: string, data?: LogData) => write("warn", event, message, data),
	error: (event: string, message: string, data?: LogData) => write("error", event, message, data),
}

export default logger
