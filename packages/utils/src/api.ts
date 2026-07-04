export function createApiClient(pkgName: string) {
  const ENDPOINT = `http://localhost:3000/${pkgName}`
  // const ENDPOINT = `/${pkgName}` -- THIS DOESNT WORK

  return {
    async call<T = any>(method: string, kwargs?: dict): Promise<T> {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, kwargs }),
      })
      if (!res.ok) throw new Error(await res.text())
      return await res.json()
    },
  }
}
