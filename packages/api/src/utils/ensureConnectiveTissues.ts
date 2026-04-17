import * as recast from 'recast'
import * as parser from 'recast/parsers/typescript'
import path from 'path'
import { readFileSafe, writeFileSafe, glob } from './fs'

const b = recast.types.builders
type ASTNode = recast.types.ASTNode

// ---------- path helpers ----------

const norm = (p: string) => p.replace(/\\/g, '/')

const isAppletFile = (p: string) =>
  /\/components\/applets\/[^/]+\.(tsx?|jsx?)$/.test(norm(p)) ||
  /\/components\/applets\/[^/]+\/[^/]+\.(tsx?|jsx?)$/.test(norm(p))

const isFeatureService = (p: string) =>
  /\/features\/[^/]+\/[^/]+\.service\.ts$/.test(norm(p))

const isServiceIndex = (p: string) =>
  /\/services\/[^/]+\/index\.ts$/.test(norm(p))

const isDbFile = (p: string) => {
  const n = norm(p)
  return /\/db\/(schema|database)\.ts$/.test(n) || /\/db\.ts$/.test(n)
}

const appletNameFromPath = (p: string) => {
  const n = norm(p)
  const m = n.match(/\/applets\/([^/]+?)(?:\/[^/]+)?\.(tsx?|jsx?)$/)
  if