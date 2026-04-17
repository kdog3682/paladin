import { useState, useCallback } from "react"
import type { RunResult } from "./types"

const API_BASE = "/runcode"

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

export function useSetAutoRun() {
  const mutate = useCallback((vars: { file: string; enabled: boolean }) => {
    postJson<{ file: string; enabled: boolean }>("/autorun", vars)
  }, [])
  return { mutate }
}

export function useRerun() {
  const [isPending, setIsPending] = useState(false)
  const mutate = useCallback(
    (vars: { file: string }, opts?: { onSuccess?: (data: RunResult) => void }) => {
      setIsPending(true)
      postJson<RunResult>("/rerun", vars)
        .then((data) => opts?.onSuccess?.(data))
        .finally(() => setIsPending(false))
    },
    [],
  )
  return { mutate, isPending }
}
