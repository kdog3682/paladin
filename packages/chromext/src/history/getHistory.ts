import type {GetHistoryOpts, HistoryEntry, HistoryExport} from './types'

const DAY_MS = 24 * 60 * 60 * 1000

const iso = (ms: number | undefined) => new Date(ms ?? 0).toISOString()

/*
 * read browser history for the last `days` days (default 7)
 * requires the "history" permission
 */
export const getHistory = async (opts: GetHistoryOpts = {}): Promise<HistoryExport> => {
  const {days = 7, text = '', includeVisits = false, maxResults = 1_000_000} = opts

  const to = Date.now()
  const from = to - days * DAY_MS

  const items = await chrome.history.search({text, startTime: from, endTime: to, maxResults})

  const entries = await Promise.all(
    items
      .filter((item): item is chrome.history.HistoryItem & {url: string} => !!item.url)
      .map(async item => {
        const entry: HistoryEntry = {
          url: item.url,
          title: item.title ?? '',
          lastVisit: iso(item.lastVisitTime),
          visitCount: item.visitCount ?? 0,
          typedCount: item.typedCount ?? 0,
        }

        if (includeVisits) {
          const visits = await chrome.history.getVisits({url: item.url})
          entry.visits = visits
            .filter(v => (v.visitTime ?? 0) >= from && (v.visitTime ?? 0) <= to)
            .map(v => ({time: iso(v.visitTime), transition: v.transition}))
            .sort((a, b) => b.time.localeCompare(a.time))
        }

        return entry
      }),
  )

  entries.sort((a, b) => b.lastVisit.localeCompare(a.lastVisit))

  return {
    exportedAt: iso(to),
    from: iso(from),
    to: iso(to),
    count: entries.length,
    entries,
  }
}
