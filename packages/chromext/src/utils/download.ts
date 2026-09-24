export type DownloadOpts = {
  /* filename relative to the downloads folder */
  filename: string
  /* file contents, non-strings are serialised as pretty json */
  data: unknown
  /* mime type, defaults to application/json for non-strings and text/plain for strings */
  mime?: string
  /* show the save-as dialog */
  saveAs?: boolean
  /* what to do when the filename already exists, defaults to uniquify */
  conflictAction?: chrome.downloads.FilenameConflictAction
}

/*
 * save data as a file via chrome.downloads
 * uses a data url since blob urls are unavailable in mv3 service workers
 * requires the "downloads" permission, returns the download id
 */
export const download = async (opts: DownloadOpts): Promise<number> => {
  const {filename, data, saveAs = false, conflictAction = 'uniquify'} = opts

  const isString = typeof data === 'string'
  const body = isString ? data : JSON.stringify(data, null, 2)
  const mime = opts.mime ?? (isString ? 'text/plain' : 'application/json')
  const url = `data:${mime};charset=utf-8,${encodeURIComponent(body)}`

  return chrome.downloads.download({url, filename, saveAs, conflictAction})
}
