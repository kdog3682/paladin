import {readdir} from 'node:fs/promises'
import {join, parse} from 'node:path'
import {Hono} from 'hono'
import type {Router} from './base'

const IGNORE = new Set(['base', 'index'])

const isRouteFile = (file: string) => {
  if (!/\.(ts|js)$/.test(file)) return false
  if (/\.(test|spec|d)\.(ts|js)$/.test(file)) return false
  return !IGNORE.has(parse(file).name.toLowerCase())
}

const toHono = (value: unknown): Hono | undefined => {
  if (value instanceof Hono) return value
  const hono = (value as Partial<Router> | undefined)?.hono
  return hono instanceof Hono ? hono : undefined
}

const files = (await readdir(import.meta.dir)).filter(isRouteFile).sort()

export const routes = new Hono()

for (const file of files) {
  const mod = await import(join(import.meta.dir, file))
  const hono = toHono(mod.default)
  if (!hono) continue
  routes.route(`/${parse(file).name.toLowerCase()}`, hono)
}

routes.notFound(c => Response.json({error: `not found: ${c.req.path}`}, {status: 404}))

export default routes
