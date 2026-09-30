import {Hono} from 'hono'
import type {Context} from 'hono'

/* every route group in this folder is mounted under this prefix, so a client needs one proxy entry */
export const API_PREFIX = '/api'

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/* body of every non-2xx response */
export type ErrorBody = {error: string}

type CleanKey<K extends string> =
  K extends `${infer N}{${string}` ? N
  : K extends `${infer N}?` ? N
  : K

/* '/a/:id/b/:name' -> 'id' | 'name' */
export type ParamKeys<P extends string> =
  P extends `${string}:${infer K}/${infer Rest}` ? CleanKey<K> | ParamKeys<`/${Rest}`>
  : P extends `${string}:${infer K}` ? CleanKey<K>
  : never

export type Params<P extends string> = {[K in ParamKeys<P>]: string}

/* input is path params + query + json body merged (body wins) */
export type Handler<P extends string, I, O> = (input: Params<P> & I, c: Context<any, P>) => O | Promise<O>

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

const send = (body: unknown, status = 200) => Response.json(body, {status})

const readBody = async (c: Context, method: Method) => {
  if (method === 'get') return {}
  const text = await c.req.text()
  if (!text.trim()) return {}
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new HttpError(400, 'invalid json body')
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'json body must be an object')
  }
  return body as Record<string, unknown>
}

const readInput = async (c: Context, method: Method) => ({
  ...c.req.query(),
  ...(await readBody(c, method)),
  // path params last so the url is the source of truth
  ...c.req.param(),
})

export const fail = (status: number, message: string): never => {
  throw new HttpError(status, message)
}

export const createRouter = () => {
  const hono = new Hono()

  const add = (method: Method) =>
    <P extends string, I = {}, O = unknown>(path: P, handler: Handler<P, I, O>) => {
      hono[method](path, async c => {
        try {
          const input = (await readInput(c, method)) as Params<P> & I
          const data = await handler(input, c as Context<any, P>)
          // undefined isn't valid json
          return send(data ?? null)
        } catch (e) {
          const status = e instanceof HttpError ? e.status : 500
          const error = e instanceof Error ? e.message : String(e)
          return send({error} satisfies ErrorBody, status)
        }
      })
    }

  return {
    hono,
    get: add('get'),
    post: add('post'),
    put: add('put'),
    patch: add('patch'),
    delete: add('delete'),
  }
}

export type Router = ReturnType<typeof createRouter>
