// src/components/SessionMonitor/api.ts

import { useMutation } from "@tanstack/react-query"
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
  return useMutation({
    mutationFn: (vars: { file: string, enabled: boolean }) =>
      postJson<{ file: string, enabled: boolean }>("/autorun", vars),
  })
}

export function useRerun() {
  return useMutation({
    mutationFn: (vars: { file: string }) =>
      postJson<RunResult>("/rerun", vars),
  })
}
