import OpenAI from "openai"
import { PROVIDERS } from "./ask.providers"

interface Config {
  provider?: "deepseek" | "glm" | "moonshot"
  effort?: "high" | "medium" | "low"
  system?: string
  temperature?: number
  max_tokens?: number
  /** Shape shorthand, keys only — `"{foo, bar}"` or `"[{a, b, c}]"` */
  jsonSchema?: string
}

type TextConfig = Config & { jsonSchema?: undefined }
type JsonConfig = Config & { jsonSchema: string }

/** Send a prompt to an LLM — returns text, or parsed JSON when `jsonSchema` is set. */
export async function ask(prompt: string, config?: TextConfig): Promise<string>
export async function ask<T = unknown>(prompt: string, config: JsonConfig): Promise<T>
export async function ask<T = unknown>(
  prompt: string,
  {
    provider = "glm",
    effort = "high",
    system,
    temperature = 0.7,
    max_tokens = 4096,
    jsonSchema,
  }: Config = {}
): Promise<string | T> {
  const { baseURL, apiKeyEnv, models } = PROVIDERS[provider]
  const apiKey = process.env[apiKeyEnv]

  if (!apiKey) {
    throw new Error(`${apiKeyEnv} not found. Source .env.private.sh`)
  }

  const instruction = jsonSchema
    ? `Respond with JSON only. No prose, no markdown fences. Use exactly these keys:\n${jsonSchema}`
    : undefined

  const content = [system, instruction].filter(Boolean).join("\n\n")

  const client = new OpenAI({ apiKey, baseURL })

  const response = await client.chat.completions.create({
    model: models[effort],
    messages: [
      ...(content ? [{ role: "system" as const, content }] : []),
      { role: "user" as const, content: prompt },
    ],
    temperature,
    max_tokens,
    stream: false,
    ...(jsonSchema ? { response_format: { type: "json_object" as const } } : {}),
  })

  const text = response.choices[0]?.message?.content ?? ""

  return jsonSchema ? parseJson<T>(text) : text
}

function parseJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  const body = (fenced?.[1] ?? text).trim()

  try {
    return JSON.parse(body) as T
  } catch {
    const start = body.search(/[{[]/)
    const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"))

    if (start !== -1 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1)) as T
      } catch {}
    }

    throw new Error(`Expected JSON, got: ${body.slice(0, 200)}`)
  }
}
