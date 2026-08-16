import { consolidateSmallFiles } from './commands/consolidateSmallFiles'
import { defaultEntryPatterns, knip } from './commands/knip'

export { consolidateSmallFiles, defaultEntryPatterns, knip }
export type { CleanupSummary, KnipOptions } from './commands/knip'
export type { ConsolidateOptions, ConsolidationSummary } from './commands/consolidateSmallFiles'

export const commands = {
  knip,
  consolidateSmallFiles,
}

export type CommandName = keyof typeof commands

export const isCommandName = (value: string): value is CommandName =>
  Object.prototype.hasOwnProperty.call(commands, value)
