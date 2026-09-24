import {download} from '../utils/download'
import {getHistory} from './getHistory'
import type {DownloadHistoryOpts, DownloadHistoryResult} from './types'

/*
 * fetch history and save it as a json file
 * requires the "history" and "downloads" permissions
 */
export const downloadHistory = async (opts: DownloadHistoryOpts = {}): Promise<DownloadHistoryResult> => {
  const {filename: name, saveAs, ...historyOpts} = opts

  const data = await getHistory(historyOpts)
  const filename = name ?? `history-${data.exportedAt.slice(0, 10)}.json`
  const downloadId = await download({filename, data, saveAs})

  return {downloadId, filename, count: data.count}
}
