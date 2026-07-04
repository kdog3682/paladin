// @paladin/packages/codeform/formatter.test.ts

import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { mkdtemp, writeFile, mkdir, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { document } from "./documenter"
import { format } from "./formatter"

const TYPES = `
/** A user in the system */
export type User = {
  id: string
  name: string
  email?: string
}

/** Available roles */
export enum Role {
  Admin,
  Member,
  Guest
}

/** Pagination options */
export interface PageOpts {
  page: number
  limit: number
  sort?: string
}

/** Max retry attempts */
export const MAX_RETRIES = 3

/** Internal — not imported anywhere */
export type InternalMeta = {
  created: number
}
`

const SERVICE = `
import { User, Role, PageOpts } from "../types"

/** User service for managing accounts */
export class UserService {
  /** All cached users */
  public users: User[]

  /** Service name */
  private name: string

  /** Whether the service is running */
  protected active: boolean

  /** Get the current user count */
  get count(): number {
    return this.users.length
  }

  /** Set the active state */
  set running(val: boolean) {
    this.active = val
  }

  /** Find users by role */
  async findByRole(role: Role, opts: PageOpts): Promise<User[]> {
    return []
  }

  /** Reset all users */
  static reset(): void {}

  /** Internal cleanup */
  private cleanup(): void {}
}

/** Fetch a user by id */
export async function getUser(id: string): Promise<User> {
  return { id, name: "test" }
}
`

const HANDLER = `
import { User } from "../types"
import { UserService } from "./service"

/** Handle an incoming request */
export function handle(req: Request, user: User): Response {
  return new Response("ok")
}

/** Create a new handler with defaults */
export function create(svc: UserService): (req: Request) => Response {
  return (req) => new Response("ok")
}
`

let dir: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "codeform-"))
  await writeFile(join(dir, "types.ts"), TYPES)
  await mkdir(join(dir, "lib"), { recursive: true })
  await writeFile(join(dir, "lib/service.ts"), SERVICE)
  await writeFile(join(dir, "lib/handler.ts"), HANDLER)
})

afterAll(async () => {
  await rm(dir, { recursive: true })
})

describe("formatter", () => {
  it("generates agent spec", async () => {
    const files = [
      join(dir, "types.ts"),
      join(dir, "lib/service.ts"),
      join(dir, "lib/handler.ts"),
    ]
    const result = await document(dir, files)
    const spec = format(result).replace(dir, "<tmpdir>")

    expect(spec).toMatchSnapshot()
  })
})
