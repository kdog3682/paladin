// @paladin/packages/api/src/logger.ts

const isTesting = !!process.env.TESTING || true

const prefix = (level: string) => `[${level}] ${new Date().toISOString()}`

const noop = (..._args: unknown[]) => {}

export const log = isTesting
  ? { info: noop, warn: noop, error: noop }
  : {
      info: (...args: unknown[]) => console.log(prefix("INFO"), ...args),
      warn: (...args: unknown[]) => console.warn(prefix("WARN"), ...args),
      error: (...args: unknown[]) => console.error(prefix("ERROR"), ...args),
    }