import type { ApiClient } from './commands'

const ENDPOINT = '/api/cme'

export const apiClient: ApiClient = {
  async call(method, args = [], opts) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, args }),
      })
      if (!res.ok) throw new Error(await res.text())
      const result = await res.json()
      opts?.onSuccess?.(result)
      return result
    } catch (err) {
      opts?.onError?.(err)
      throw err
    }
  },
}
