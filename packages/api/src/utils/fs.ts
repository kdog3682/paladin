// @paladin/packages/api/src/utils/fs.ts

import { stat } from "fs/promises"

export async function waitForStable(
  filepath: string,
  interval = 200,
  maxWait = 5000,
): Promise<void> {
  let lastSize = -1
  let elapsed = 0

  while (elapsed < maxWait) {
    try {
      const { size } = await stat(filepath)
      if (size > 0 && size === lastSize) return
      lastSize = size
    } catch {
      // file may not exist yet
    }

    await new Promise((r) => setTimeout(r, interval))
    elapsed += interval
  }
}
