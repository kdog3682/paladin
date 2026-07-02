// Foundry's public entry. The server calls processFile when a file lands; that
// single call cascades: read payload -> scaffold/update project -> reconcile,
// emit tree, and (if autoRun) rerun stale runnables. Emission is via onEvent.

import { expandHome } from '../../utils/path'
import { prepareTypescript } from './orchestrator'
import { session } from './session'

export { onEvent, type FoundryEvent } from './session'
export { default as routes } from './routes'

// Reads a dropped file into one-or-more source payloads. A .zip is expanded to
// its entries; anything else is read as a single text payload.
async function readInputs(file: string): Promise<string[]> {
  const path = expandHome(file)
  if (path.endsWith('.zip')) {
    const { unzipSync, strFromU8 } = await import('fflate')
    const buf = new Uint8Array(await Bun.file(path).arrayBuffer())
    const entries = unzipSync(buf)
    return Object.values(entries).map((u8) => strFromU8(u8))
  }
  return [await Bun.file(path).text()]
}

// The cascade. Returns nothing — all output flows through the event bus.
export async function processFile(file: string): Promise<void> {
  const contents = await readInputs(file)
  const tree = await prepareTypescript(contents)
  if (!tree) return
  await session.ingest(tree)
}
