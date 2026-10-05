import { getChangeFrequency, type FrequencyEntry } from "./statistics.ts"

const PALADIN = "/home/kdog3682/projects/paladin"

function print(title: string, entries: FrequencyEntry[]) {
  console.log(`\n${title}`)
  if (!entries.length) return console.log("  (none)")
  const width = Math.max(...entries.map((e) => String(e.commits).length))
  for (const e of entries) {
    console.log(`  ${String(e.commits).padStart(width)}  ${e.lastChanged}  ${e.path}`)
  }
}

async function run(label: string, opts: Parameters<typeof getChangeFrequency>[1]) {
  const { files, dirs, totalCommits } = await getChangeFrequency(PALADIN, opts)
  console.log(`\n=== ${label} (${totalCommits} commits) ===`)
  print("files", files)
  print("dirs", dirs)
}

const exclude = [/(^|\/)(bun\.lockb?|package-lock\.json|pnpm-lock\.yaml)$/, /(^|\/)dist\//]

await run("all time", { limit: 15, maxFilesPerCommit: 50, exclude })
await run("last 30 days", { since: "30 days ago", limit: 10, exclude })
await run("packages/utils, last 3 months", { since: "3 months ago", paths: ["packages/utils"], limit: 10, exclude })
