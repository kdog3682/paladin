// @org/analyze-v2/src/analyze.test.ts

import { describe, it, expect } from "bun:test"
import { analyzeFile } from "./index"

const KITCHEN_SINK = `// @org/scaffold/src/kitchen-sink.ts

import { z } from "zod"
import { Hono } from "hono"
import { eq } from "drizzle-orm"
import type { Context } from "hono"
import { users } from "@org/db/schema"
import { createLogger } from "@org/utils/logger"
import { validateRequest } from "../../middleware/validation"
import type { AppEnv } from "../types"

// — Types & Interfaces —
/** Represents the lifecycle state of an async operation. */
type Status = "idle" | "loading" | "success" | "error"

/** Core user entity returned by the API. */
interface User {
  id: string
  name: string
  email: string
  role: "admin" | "member" | "guest"
}

/** Generic wrapper for all API responses. */
interface ApiResponse<T> {
  data: T
  status: Status
  meta?: { page: number, total: number }
}

// — Enum —
enum LogLevel {
  Debug = "DEBUG",
  Info = "INFO",
  Warn = "WARN",
  Error = "ERROR",
}

// — Constants —
const MAX_RETRIES = 3
const BASE_URL = "https://api.example.com" as const

// — Utility Functions —
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const slugify = (text: string): string =>
  text.toLowerCase().replace(/\\s+/g, "-").replace(/[^a-z0-9-]/g, "")

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

// — Generic Class —
/** Type-safe pub/sub event bus with automatic cleanup. */
class EventBus<TEvents extends Record<string, unknown>> {
  private listeners = new Map<keyof TEvents, Set<(payload: any) => void>>()

  on<K extends keyof TEvents>(event: K, handler: (payload: TEvents[K]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(handler)
    return () => this.listeners.get(event)?.delete(handler)
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]) {
    this.listeners.get(event)?.forEach((fn) => fn(payload))
  }
}

// — Async w/ Generics —
async function fetchWithRetry<T>(url: string, retries = MAX_RETRIES): Promise<ApiResponse<T>> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(\`\${BASE_URL}\${url}\`)
    if (res.ok) return { data: await res.json() as T, status: "success" }
    if (attempt < retries) await sleep(2 ** attempt * 100)
  }
  throw new Error(\`Failed after \${retries} retries\`)
}

// — Type Guards & Narrowing —
const isUser = (value: unknown): value is User =>
  typeof value === "object" && value !== null && "email" in value

// — Mapped / Conditional Types —
type Readonly<T> = { readonly [K in keyof T]: T[K] }
type PickByType<T, V> = { [K in keyof T as T[K] extends V ? K : never]: T[K] }

type UserStringFields = PickByType<User, string> // { id, name, email }

// — Usage Example —
const bus = new EventBus<{ userJoined: User, log: string }>()

const unsub = bus.on("userJoined", (user) => {
  console.log(\`[\${LogLevel.Info}] \${user.name} (\${user.role}) joined\`)
})

bus.emit("userJoined", { id: "1", name: "Ada Lovelace", email: "ada@example.com", role: "admin" })
unsub()
`

describe("analyzeFile", () => {
  it("parses doc from kitchen-sink", () => {
    const result = analyzeFile(KITCHEN_SINK)
    expect(result.doc).toMatchSnapshot()
  })

  it("builds chunks from kitchen-sink", () => {
    const result = analyzeFile(KITCHEN_SINK)
    expect(result.chunks).toMatchSnapshot()
  })

  it("full analysis of kitchen-sink", () => {
    const result = analyzeFile(KITCHEN_SINK)
    expect(result).toMatchSnapshot()
  })
})
