import { unlink } from 'fs/promises'
import { mergeFile } from './utils/mergeFile'
import type { Unit } from './types'

/**
 * Writes a unit's files to disk, honouring each file's action.
 */
export async function persist(unit: Unit): Promise<void> {
  for (const file of unit.files) {
    if (file.action === 'skip') continue

    if (file.action === 'delete') {
      await unlink(file.path)
      continue
    }

    if (file.action === 'append') {
      const current = await Bun.file(file.path).text()
      await Bun.write(file.path, mergeFile(current, file.content))
      continue
    }

    await Bun.write(file.path, file.content)
  }
}
