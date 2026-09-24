export type HistoryVisit = {
  /* visit time as an ISO string */
  time: string
  /* how the browser navigated to the url on this visit */
  transition: chrome.history.TransitionType
}

export type HistoryEntry = {
  url: string
  title: string
  /* most recent visit as an ISO string */
  lastVisit: string
  /* total visits to this url, all time */
  visitCount: number
  /* times the url was typed into the address bar */
  typedCount: number
  /* visits inside the requested window, only present when includeVisits is set */
  visits?: HistoryVisit[]
}

export type HistoryExport = {
  /* when the export was produced, ISO string */
  exportedAt: string
  /* start of the window, ISO string */
  from: string
  /* end of the window, ISO string */
  to: string
  count: number
  entries: HistoryEntry[]
}

export type GetHistoryOpts = {
  /* how many days back to look, defaults to 7 */
  days?: number
  /* text filter on url and title, empty matches everything */
  text?: string
  /* also fetch each url's individual visits within the window */
  includeVisits?: boolean
  /* cap on returned urls, defaults to effectively unlimited */
  maxResults?: number
}

export type DownloadHistoryOpts = GetHistoryOpts & {
  /* filename relative to the downloads folder, defaults to history-<date>.json */
  filename?: string
  /* show the save-as dialog */
  saveAs?: boolean
}

export type DownloadHistoryResult = {
  downloadId: number
  filename: string
  count: number
}
