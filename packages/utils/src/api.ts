export async function call<T = any>(method: string, ...args: any): Promise<T> {
    const ENDPOINT = `http://localhost:3000/controller`
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, args }),
    })
    if (!res.ok) throw new Error(await res.text())
    return await res.json()
}
