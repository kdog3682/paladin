import OpenAI from "openai"
import { homedir } from "node:os"
import { join } from "node:path"
import { cached, getApiKey } from "@paladin/utils"
import { PROVIDERS } from "./ask.providers"

export type Provider = "deepseek" | "glm" | "moonshot"

export type Effort = "high" | "medium" | "low"

export type AskConfig = {
  /* which provider to route to, defaults to deepseek */
  provider?: Provider
  /* picks the provider's model tier, defaults to high */
  effort?: Effort
  system?: string
  temperature?: number
  max_tokens?: number
  /* shape shorthand, keys only — `"{foo, bar}"` or `"[{a, b, c}]"`. when set, the reply is parsed as JSON */
  jsonSchema?: string
  /* reuse a saved reply for the same provider, effort, system and prompt. defaults to true */
  cache?: boolean
}

type RequestOpts = {
  provider: Provider
  effort: Effort
  temperature: number
  max_tokens: number
  json: boolean
  cache: boolean
}

/* where cached replies live, one json file per request */
export const ASK_CACHE_DIR = join(homedir(), ".cache", "paladin", "ask")

/* send a prompt to an LLM. returns the text, or the parsed JSON when `jsonSchema` is set (type it with `T`) */
export async function ask<T = string>(prompt: string, config: AskConfig = {}): Promise<T> {
  const {
    provider = "deepseek",
    effort = "high",
    system,
    temperature = 0.7,
    max_tokens = 4096,
    jsonSchema,
    cache = true,
  } = config

  const instruction = jsonSchema
    ? `Respond with JSON only. No prose, no markdown fences. Use exactly these keys:\n${jsonSchema}`
    : undefined
  // the json instruction is part of the system content, so it's covered by the cache key too
  const content = [system, instruction].filter(Boolean).join("\n\n")

  const text = await complete(prompt, content, { provider, effort, temperature, max_tokens, json: !!jsonSchema, cache })
  return (jsonSchema ? parseJson(text) : text) as T
}

const complete = cached(request, {
  dir: ASK_CACHE_DIR,
  key: (prompt, content, opts) => (opts.cache ? [opts.provider, opts.effort, content, prompt] : undefined),
})

/* wipe every cached reply */
export const clearAskCache = () => complete.clear()

async function request(prompt: string, content: string, opts: RequestOpts): Promise<string> {
  const { baseURL, apiKeyEnv, models } = PROVIDERS[opts.provider]
  const apiKey = await getApiKey(apiKeyEnv)

  const client = new OpenAI({ apiKey, baseURL })
  const response = await client.chat.completions.create({
    model: models[opts.effort],
    messages: [
      ...(content ? [{ role: "system" as const, content }] : []),
      { role: "user" as const, content: prompt },
    ],
    temperature: opts.temperature,
    max_tokens: opts.max_tokens,
    stream: false,
    ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
  })

  // throw on empty so a blank reply never gets cached
  const text = response.choices[0]?.message?.content ?? ""
  if (!text) throw new Error(`${opts.provider} returned an empty reply`)
  return text
}

function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  const body = (fenced?.[1] ?? text).trim()

  try {
    return JSON.parse(body)
  } catch {
    const start = body.search(/[{[]/)
    const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"))
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1))
      } catch {}
    }
    throw new Error(`Expected JSON, got: ${body.slice(0, 200)}`)
  }
}
