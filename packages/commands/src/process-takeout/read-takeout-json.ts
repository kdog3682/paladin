import { join } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'

/*
 * collect the parsed contents of every file named `filename` inside the
 * Takeout dir, whether it is still inside a zip or already extracted.
 * each match is expected to hold a json array, and the arrays are concatenated
 */
export async function readTakeoutJson<T>(dir: string, filename: string): Promise<T[]> {
  const out: T[] = []

  for await (const rel of new Bun.Glob('**/*.zip').scan(dir)) {
    const bytes = await Bun.file(join(dir, rel)).bytes()
    // only the matching entries are decompressed
    const files = unzipSync(bytes, {
      filter: f => f.name === filename || f.name.endsWith(`/${filename}`),
    })
    for (const data of Object.values(files)) {
      out.push(...JSON.parse(strFromU8(data)))
    }
  }

  for await (const rel of new Bun.Glob(`**/${filename}`).scan(dir)) {
    out.push(...(await Bun.file(join(dir, rel)).json()))
  }

  return out
}
