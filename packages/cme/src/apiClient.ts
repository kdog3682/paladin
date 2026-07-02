import type { ApiClient } from './commands/types'

const ENDPOINT = '/api/cme'

export const apiClient: ApiClient = {
  async call(method, args = [], onSuccess, onError) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, args }),
      })
      if (!res.ok) throw new Error(await res.text())
      const result = await res.json()
      onSuccess?.(result)
      return result
    } catch (err) {
      onError?.(err)
      throw err
    }
  },
}
