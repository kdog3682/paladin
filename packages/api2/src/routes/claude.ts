import {stat} from 'node:fs/promises'
import {resolve} from 'node:path'
import {query} from '@anthropic-ai/claude-agent-sdk'
import type {Options, SDKMessage} from '@anthropic-ai/claude-agent-sdk'
import {createRouter, fail} from './base'

export const MODELS = {
  opus: {id: 'claude-opus-5-5', name: 'Opus 5.5'},
  sonnet: {id: 'claude-sonnet-5', name: 'Sonnet 5'},
} as const

export type ModelKey = keyof typeof MODELS

const isModelKey = (key: string): key is ModelKey => key in MODELS

type ClaudeState = {
  /* working directory claude runs in */
  cwd: string
  /* current session, undefined means the next message starts a new one */
  sessionId?: string
  /* key into MODELS */
  model: ModelKey
  /* replaces the claude code system prompt when set */
  systemPrompt?: string
  /* true while a message is in flight */
  busy: boolean
}

const state: ClaudeState = {
  cwd: process.cwd(),
  model: 'opus',
  busy: false,
}

const snapshot = () => ({
  cwd: state.cwd,
  sessionId: state.sessionId,
  model: state.model,
  systemPrompt: state.systemPrompt,
  busy: state.busy,
})

const assertIdle = (what: string) => {
  if (state.busy) fail(409, `cannot ${what} while a message is running`)
}

const baseOptions = (): Options => ({
  cwd: state.cwd,
  model: MODELS[state.model].id,
  systemPrompt: state.systemPrompt,
  // no permission prompts, claude can do anything in cwd
  permissionMode: 'bypassPermissions',
  allowDangerouslySkipPermissions: true,
})

const app = createRouter()

app.get('/', () => snapshot())

app.get('/models', () => Object.entries(MODELS).map(([key, m]) => ({key, ...m})))

app.post('/config/cwd', async ({cwd}: {cwd: string}) => {
  if (!cwd) fail(400, 'cwd is required')
  assertIdle('change cwd')
  const abs = resolve(cwd)
  const info = await stat(abs).catch(() => null)
  if (!info?.isDirectory()) fail(400, `not a directory: ${abs}`)
  state.cwd = abs
  // sessions are stored per project dir, so an old id won't resume here
  state.sessionId = undefined
  return snapshot()
})

/* model is a key from MODELS, ie opus | sonnet */
app.post('/config/model', ({model}: {model: string}) => {
  if (!isModelKey(model)) fail(400, `unknown model: ${model}, expected one of ${Object.keys(MODELS).join(' | ')}`)
  state.model = model as ModelKey
  return snapshot()
})

/* empty or missing prompt resets to the claude code default */
app.post('/config/system-prompt', ({systemPrompt}: {systemPrompt?: string}) => {
  state.systemPrompt = systemPrompt || undefined
  return snapshot()
})

app.post('/session/new', () => {
  assertIdle('start a session')
  state.sessionId = undefined
  return snapshot()
})

app.post('/session/resume/:id', ({id}) => {
  assertIdle('resume')
  state.sessionId = id
  return snapshot()
})

app.post('/message', async ({prompt}: {prompt: string}) => {
  if (!prompt?.trim()) fail(400, 'prompt is required')
  if (state.busy) fail(409, 'claude is busy')

  state.busy = true
  try {
    const options: Options = {...baseOptions(), resume: state.sessionId}

    const messages: SDKMessage[] = []
    let result: string | undefined
    let error: string | undefined
    let costUsd: number | undefined
    let turns: number | undefined

    for await (const msg of query({prompt, options})) {
      messages.push(msg)
      if ('session_id' in msg && msg.session_id) state.sessionId = msg.session_id
      if (msg.type !== 'result') continue
      costUsd = msg.total_cost_usd
      turns = msg.num_turns
      if (msg.subtype === 'success') result = msg.result
      else error = msg.subtype
    }

    return {sessionId: state.sessionId, result, error, costUsd, turns, messages}
  } finally {
    state.busy = false
  }
})

export default app
