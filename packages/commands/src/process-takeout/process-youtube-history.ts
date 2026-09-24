import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { google, type youtube_v3 } from 'googleapis'
import { getAuth } from '@paladin/gapi'
import { readTakeoutJson } from './read-takeout-json'

const DATA_DIR = join(homedir(), '.paladin/data')
const HISTORY_PATH = join(DATA_DIR, 'youtube-history.json')
const META_CACHE_PATH = join(DATA_DIR, 'youtube-meta-cache.json')
const BATCH_SIZE = 50

type TakeoutEntry = {
  title: string
  titleUrl?: string
  subtitles?: { name: string, url?: string }[]
  time: string
  /* present on ads ("From Google Ads"), which are skipped */
  details?: { name: string }[]
}

export type YoutubeHistoryItem = {
  /* video title, without the "Watched " prefix */
  title: string
  /* iso time of the most recent watch */
  time: string
  /* channel name, null when takeout and the api both lack it */
  channel: string | null
  /* youtube video id parsed from the watch url */
  id: string
  /* number of times the video was watched */
  count: number
  /* uploader-set tags, empty when none were set or the video is gone */
  tags: string[]
  description: string
  /* category name, e.g. "Gaming" */
  category: string | null
}

type Watch = {
  id: string
  title: string
  channel: string | null
  time: string
}

type VideoMeta = {
  tags: string[]
  description: string
  category: string | null
  channel: string | null
}

/* keyed by video id. null means the api returned nothing (deleted/private), so it is not asked again */
type MetaCache = Record<string, VideoMeta | null>

/*
 * merge watch-history.json from the Takeout dir into ~/.paladin/data/youtube-history.json.
 * returns the newly added items, newest first
 */
export async function processYoutubeHistory(takeoutDir: string): Promise<YoutubeHistoryItem[]> {
  const history = await readJson<YoutubeHistoryItem[]>(HISTORY_PATH, [])
  const cursor = Math.max(0, ...history.map(h => Date.parse(h.time)))

  const seen = new Set<string>()
  const watches = (await readTakeoutJson<TakeoutEntry>(takeoutDir, 'watch-history.json'))
    .filter(e => !e.details)
    .map(toWatch)
    .filter((w): w is Watch => w !== null)
    .filter(w => Date.parse(w.time) > cursor)
    // guards against the same file appearing in more than one zip
    .filter(w => {
      const key = `${w.id}|${w.time}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))

  if (!watches.length) {
    console.log('youtube history: nothing new')
    return []
  }

  const byId = new Map(history.map(h => [h.id, h]))
  const newIds = [...new Set(watches.map(w => w.id))].filter(id => !byId.has(id))

  const cache = await readJson<MetaCache>(META_CACHE_PATH, {})
  const uncached = newIds.filter(id => !(id in cache))
  if (uncached.length) {
    const yt = google.youtube({ version: 'v3', auth: await getAuth() })
    await fetchMeta(yt, uncached, cache)
  }
  console.log(`youtube meta: ${newIds.length - uncached.length} cached, ${uncached.length} fetched`)

  const added: YoutubeHistoryItem[] = []
  let bumped = 0
  for (const w of watches) {
    const existing = byId.get(w.id)
    if (existing) {
      existing.count++
      existing.time = w.time
      bumped++
      continue
    }
    const meta = cache[w.id]
    const item: YoutubeHistoryItem = {
      title: w.title,
      time: w.time,
      channel: w.channel ?? meta?.channel ?? null,
      id: w.id,
      count: 1,
      tags: meta?.tags ?? [],
      description: meta?.description ?? '',
      category: meta?.category ?? null,
    }
    byId.set(w.id, item)
    history.push(item)
    added.push(item)
  }

  history.sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
  await writeJson(HISTORY_PATH, history)

  console.log(`youtube history: ${added.length} new, ${bumped} rewatches, ${history.length} total`)
  return added.reverse()
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  const file = Bun.file(path)
  return (await file.exists()) ? await file.json() : fallback
}

async function writeJson(path: string, data: unknown) {
  await mkdir(dirname(path), { recursive: true })
  await Bun.write(path, JSON.stringify(data, null, 2))
}

function toWatch(e: TakeoutEntry): Watch | null {
  const id = e.titleUrl ? videoIdFromUrl(e.titleUrl) : null
  if (!id) return null
  return {
    id,
    title: e.title.replace(/^Watched /, ''),
    channel: e.subtitles?.[0]?.name ?? null,
    time: e.time,
  }
}

function videoIdFromUrl(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null
  const v = u.searchParams.get('v')
  if (v) return v
  const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/)
  return m?.[1] ?? null
}

async function fetchCategories(yt: youtube_v3.Youtube) {
  const res = await yt.videoCategories.list({ part: ['snippet'], regionCode: 'US' })
  return new Map((res.data.items ?? []).map(c => [c.id ?? '', c.snippet?.title ?? '']))
}

/*
 * fetch metadata into `cache`, saving it after every batch so a crash
 * partway through keeps what was already fetched. 1 quota unit per 50 ids
 */
async function fetchMeta(yt: youtube_v3.Youtube, ids: string[], cache: MetaCache) {
  const categories = await fetchCategories(yt)

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE)
    const res = await yt.videos.list({ part: ['snippet'], id: batch, maxResults: BATCH_SIZE })

    // deleted/private videos are absent from the result, cache them as null
    for (const id of batch) cache[id] = null
    for (const v of res.data.items ?? []) {
      if (!v.id) continue
      const s = v.snippet
      cache[v.id] = {
        tags: s?.tags ?? [],
        description: s?.description ?? '',
        category: categories.get(s?.categoryId ?? '') || null,
        channel: s?.channelTitle ?? null,
      }
    }

    await writeJson(META_CACHE_PATH, cache)
  }
}
