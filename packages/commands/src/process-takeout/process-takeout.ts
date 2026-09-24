import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { processYoutubeHistory, type YoutubeHistoryItem } from './process-youtube-history'

const DEFAULT_DRIVE_DIR = '/mnt/chromeos/GoogleDrive/MyDrive'

export type ProcessTakeoutOpts = {
  /* delete the Takeout/ dir once everything is processed */
  remove?: boolean
}

export type ProcessTakeoutResult = {
  /* newly added youtube history items, newest first */
  youtube: YoutubeHistoryItem[]
}

/* returns null when there is no Takeout/ dir to process */
export async function processTakeout(opts: ProcessTakeoutOpts = {}): Promise<ProcessTakeoutResult | null> {
  const { remove = false } = opts

  const driveDir = process.env.DRIVE_DIR || DEFAULT_DRIVE_DIR
  const takeoutDir = join(driveDir, 'Takeout')
  // no Takeout/ dir means it was already processed
  if (!existsSync(takeoutDir)) return null

  const youtube = await processYoutubeHistory(takeoutDir)
  // const browser = await processBrowserHistory(takeoutDir)

  // removing Takeout/ marks this export as processed
  if (remove) await rm(takeoutDir, { recursive: true, force: true })

  return { youtube }
}
