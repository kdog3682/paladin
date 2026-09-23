import { getAuth, PORTABILITY_SCOPES } from "./auth"
import { fetchWatchHistory } from "./history"

// pick 30 or 180 day access on the consent screen so startTime/endTime are allowed
const auth = await getAuth({ scopes: [PORTABILITY_SCOPES.youtubeActivity], profile: "dataportability" })

const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

const entries = await fetchWatchHistory({
  auth,
  since,
  // set JOB_ID to resume a job that timed out or was interrupted
  jobId: process.env.JOB_ID,
  onState: s => console.error(`[${new Date().toLocaleTimeString()}] job ${s.jobId}: ${s.state}`),
})

for (const e of entries) {
  console.log(`${e.watchedAt.toLocaleString()}  ${e.title}  —  ${e.channel ?? "?"}  ${e.url}`)
}
console.log(`\n${entries.length} videos watched since ${since.toLocaleDateString()}`)
