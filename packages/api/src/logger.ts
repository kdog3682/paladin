// @paladin/packages/api/src/logger.ts

const prefix = (level: string) => `[${level}] ${new Date().toISOString()}`

export const log = {
  info: (...args: unknown[]) => console.log(prefix("INFO"), ...args),
  warn: (...args: unknown[]) => console.warn(prefix("WARN"), ...args),
  error: (...args: unknown[]) => console.error(prefix("ERROR"), ...args),
}
