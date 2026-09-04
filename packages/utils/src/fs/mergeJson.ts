import { deepMerge } from '../object/deepMerge.ts'

/**
 * deep-merges `fields` into the json file at `path` and writes it back.
 * creates the file if it does not exist.
 */
export async function mergeJson<T = any>(path: string, fields: Record<string, any>): Promise<T> {
    const file = Bun.file(path)
    const data = (await file.exists()) ? await file.json() : {}
    const merged = deepMerge(data, fields)
    await Bun.write(path, JSON.stringify(merged, null, 2) + '\n')
    return merged
}
