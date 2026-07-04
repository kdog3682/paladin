// @paladin/ai/ask.ts
import OpenAI from "openai"

type Effort = "high" | "medium" | "low"

type Provider = {
  baseURL: string
  apiKeyEnv: string
  // one model per effort level
  models: Record<Effort, string>
}

/**
 * Provider registry. Each entry is OpenAI-compatible.
 * Model IDs current as of June 2026 — re-check provider docs as they ship new ones.
 */
const PROVIDERS = {
  deepseek: {
    baseURL: "https://api.deepseek.com",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    models: {
      high: "deepseek-v4-pro",
      medium: "deepseek-v4-pro",
      low: "deepseek-v4-flash",
    },
  },
  glm: {
    baseURL: "https://api.z.ai/api/paas/v4",
    apiKeyEnv: "GLM_API_KEY",
    models: {
      high: "glm-5.2",
      medium: "glm-5",
      low: "glm-4.5-flash",
    },
  },
  moonshot: {
    baseURL: "https://api.moonshot.ai/v1",
    apiKeyEnv: "MOONSHOT_API_KEY",
    models: {
      high: "kimi-k2.6",
      medium: "kimi-k2.5",
      low: "kimi-k2.7-code",
    },
  },
  openai: {
    baseURL: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    models: {
      high: "gpt-5.4",
      medium: "gpt-5.2",
      low: "gpt-5-mini",
    },
  },
} satisfies Record<string, Provider>

type ProviderName = keyof typeof PROVIDERS

interface Config {
  provider?: ProviderName
  effort?: Effort
  system?: string
  temperature?: number
  max_tokens?: number
}

/**
 * Send a prompt to an LLM and return the response text.
 *
 * @example
 * const text = await ask("What is TypeScript?")
 *
 * @example
 * const text = await ask("What is TypeScript?", {
 *   provider: "moonshot",
 *   effort: "high",
 * })
 */
export async function ask(
  prompt: string,
  {
    provider = "glm",
    effort = "medium",
    system,
    temperature = 0.7,
    max_tokens = 4096,
  }: Config = {}
): Promise<string> {
  const { baseURL, apiKeyEnv, models } = PROVIDERS[provider]

  const apiKey = process.env[apiKeyEnv]
  if (!apiKey) {
    throw new Error(`${apiKeyEnv} not found. Source .env.private.sh`)
  }

  const client = new OpenAI({ apiKey, baseURL })

  const response = await client.chat.completions.create({
    model: models[effort],
    messages: [
      ...(system ? [{ role: "system" as const, content: system }] : []),
      { role: "user", content: prompt },
    ],
    temperature,
    max_tokens,
    stream: false,
  })

  return response.choices[0]?.message?.content ?? ""
}

const JSON_INSTRUCTION =
  "Respond ONLY with a single raw JSON code block (```json ... ```)."
/**
 * Ask for structured JSON and parse it.
 * 
 * The schema is a free-form string using shorthand type notation:
 *   - Primitives: str, int, float, bool, null
 *   - Unions:     int | str
 *   - Arrays:     [type] or [{ key: type, ... }]
 *   - Objects:    { key: type, ... }
 *
 * @example
 * const data = await askData<{ fruits: { name: string }[] }>(
 *   "List 3 fruits",
 *   "{fruits: [{name: str}]}",
 *   { provider: "openai" }
 * )

 */
export async function askData<T>(
  prompt: string,
  schema: string,
  config: Config = {}
): Promise<T> {
  const systemInstruction = [
    config.system,
    `${JSON_INSTRUCTION}\nThe JSON must conform to this shape: ${schema}`,
  ]
    .filter(Boolean)
    .join("\n\n")

  const text = await ask(prompt, {
    ...config,
    system: systemInstruction,
  })

  const match = text.match(/```json\s*([\s\S]*?)```/)
  if (!match) {
    throw new Error(`No JSON code block found in response. Text:\n${text}`)
  }

  try {
    return JSON.parse(match[1].trim()) as T
  } catch (err) {
    throw new Error(`Failed to parse JSON from response. Text:\n${text}`)
  }
}