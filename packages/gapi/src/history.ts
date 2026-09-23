import { google, type Auth, type dataportability_v1 } from "googleapis"
import { unzipSync, strFromU8 } from "fflate"
import { PORTABILITY_SCOPES } from "./auth"

export const YOUTUBE_ACTIVITY_SCOPE = PORTABILITY_SCOPES.youtubeActivity

export type ArchiveState = "STATE_UNSPECIFIED" | "IN_PROGRESS" | "COMPLETE" | "FAILED" | "CANCELLED"

export type ArchiveStatus = {
  /* the archive job id returned by initiate */
  jobId: string
  state: ArchiveState
  /* signed download urls, present once state is COMPLETE. they expire after 6h */
  urls: string[]
}

export type WatchEntry = {
  videoId: string
  /* video title with the "Watched " prefix removed */
  title: string
  url: string
  channel?: string
  channelUrl?: string
  /* "YouTube" or "YouTube Music" */
  source: string
  watchedAt: Date
}

/* one item of the My Activity json export (same shape as takeout) */
export type ActivityItem = {
  header?: string
  title?: string
  titleUrl?: string
  subtitles?: { name?: string, url?: string }[]
  details?: { name?: string }[]
  time?: string
  products?: string[]
}

export type InitiateOpts = {
  /* only export activity after this time. requires a time-based access grant */
  start?: Date
  /* only export activity before this time. requires a time-based access grant */
  end?: Date
}

export type WaitOpts = {
  /* delay between state polls, default 15s */
  pollMs?: number
  /* give up after this long, default 2h */
  timeoutMs?: number
  /* called after every poll */
  onState?: (status: ArchiveStatus) => void
}

export type ParseOpts = {
  since?: Date
  until?: Date
  /* keep entries marked "From Google Ads", default false */
  includeAds?: boolean
}

export type FetchWatchHistoryOpts = WaitOpts & ParseOpts & {
  /* oauth client authorized with YOUTUBE_ACTIVITY_SCOPE, refreshes its own tokens */
  auth: Auth.OAuth2Client
  /* resume an existing job instead of starting a new one */
  jobId?: string
  /*
   * send since/until to the api as startTime/endTime. only allowed when the user
   * granted time-based (30/180 day) access, set false for one-time grants.
   * entries are filtered locally either way. default true
   */
  timeRange?: boolean
}

export const dataportability = (auth: Auth.OAuth2Client): dataportability_v1.Dataportability =>
  google.dataportability({ version: "v1", auth })

/* start a youtube activity export job, returns the job id */
export const initiateArchive = async (auth: Auth.OAuth2Client, opts: InitiateOpts = {}): Promise<string> => {
  const { data } = await dataportability(auth).portabilityArchive.initiate({
    requestBody: {
      resources: ["myactivity.youtube"],
      startTime: opts.start?.toISOString(),
      endTime: opts.end?.toISOString(),
    },
  })
  if (!data.archiveJobId) throw new Error(`initiate returned no archiveJobId: ${JSON.stringify(data)}`)
  return data.archiveJobId
}

export const getArchiveState = async (auth: Auth.OAuth2Client, jobId: string): Promise<ArchiveStatus> => {
  const { data } = await dataportability(auth).archiveJobs.getPortabilityArchiveState({
    name: `archiveJobs/${jobId}/portabilityArchiveState`,
  })
  return {
    jobId,
    state: (data.state ?? "STATE_UNSPECIFIED") as ArchiveState,
    urls: data.urls ?? [],
  }
}

/* poll until the job is COMPLETE, throws on FAILED / CANCELLED / timeout */
export const waitForArchive = async (auth: Auth.OAuth2Client, jobId: string, opts: WaitOpts = {}): Promise<ArchiveStatus> => {
  const pollMs = opts.pollMs ?? 15_000
  const deadline = Date.now() + (opts.timeoutMs ?? 2 * 60 * 60 * 1000)
  while (true) {
    const status = await getArchiveState(auth, jobId)
    opts.onState?.(status)
    if (status.state === "COMPLETE") return status
    if (status.state === "FAILED" || status.state === "CANCELLED") {
      throw new Error(`archive job ${jobId} ended with state ${status.state}`)
    }
    if (Date.now() > deadline) throw new Error(`archive job ${jobId} still ${status.state} after timeout, resume with jobId`)
    await Bun.sleep(pollMs)
  }
}

/* revoke the grant. needed before re-exporting with a one-time access grant */
export const resetAuthorization = async (auth: Auth.OAuth2Client) => {
  await dataportability(auth).authorization.reset({ requestBody: {} })
}

const isZip = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b

const activityFromJson = (text: string): ActivityItem[] => {
  try {
    const data = JSON.parse(text)
    return Array.isArray(data) ? data.filter(d => d && typeof d === "object" && "time" in d) : []
  } catch {
    return []
  }
}

/* download the signed urls (no auth needed) and collect every activity item in every json file */
export const downloadArchive = async (urls: string[]): Promise<ActivityItem[]> => {
  const items: ActivityItem[] = []
  for (const url of urls) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`archive download failed (${res.status}), signed urls expire after 6h`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (!isZip(bytes)) {
      items.push(...activityFromJson(strFromU8(bytes)))
      continue
    }
    for (const [name, file] of Object.entries(unzipSync(bytes))) {
      if (name.toLowerCase().endsWith(".json")) items.push(...activityFromJson(strFromU8(file)))
    }
  }
  return items
}

const videoIdFrom = (url: string) => {
  try {
    const u = new URL(url)
    return u.pathname === "/watch" ? u.searchParams.get("v") : null
  } catch {
    return null
  }
}

/*
 * turn raw activity items into watch entries sorted oldest first.
 * watches are detected by their /watch?v= url, not the (localized) "Watched" title,
 * so searches, removed videos and other activity are dropped
 */
export const parseWatchHistory = (items: ActivityItem[], opts: ParseOpts = {}): WatchEntry[] => {
  const entries: WatchEntry[] = []
  for (const item of items) {
    if (!item.time || !item.titleUrl || !item.title) continue
    if (!opts.includeAds && item.details?.some(d => d.name === "From Google Ads")) continue
    const videoId = videoIdFrom(item.titleUrl)
    if (!videoId) continue
    const watchedAt = new Date(item.time)
    if (opts.since && watchedAt < opts.since) continue
    if (opts.until && watchedAt > opts.until) continue
    const channel = item.subtitles?.[0]
    entries.push({
      videoId,
      title: item.title.replace(/^Watched\s+/, ""),
      url: item.titleUrl,
      channel: channel?.name,
      channelUrl: channel?.url,
      source: item.header ?? "YouTube",
      watchedAt,
    })
  }
  return entries.sort((a, b) => a.watchedAt.getTime() - b.watchedAt.getTime())
}

/* initiate (or resume) an export, wait for it, download and parse */
export const fetchWatchHistory = async (opts: FetchWatchHistoryOpts): Promise<WatchEntry[]> => {
  const timeRange = opts.timeRange ?? true
  const jobId = opts.jobId ?? await initiateArchive(
    opts.auth,
    timeRange ? { start: opts.since, end: opts.until } : {},
  )
  const status = await waitForArchive(opts.auth, jobId, opts)
  const items = await downloadArchive(status.urls)
  return parseWatchHistory(items, opts)
}
