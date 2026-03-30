// @paladin/ai/deepseek/index.ts

import OpenAI from "openai"

const getApiKey = () => {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) throw new Error("DEEPSEEK_API_KEY not found. Source .env.private.sh")
  return key
}

type DeepseekOptions = {
  model?: string
  temperature?: number
  max_tokens?: number
}

const createClient = () =>
  new OpenAI({
    apiKey: getApiKey(),
    baseURL: "https://api.deepseek.com",
  })

export async function deepseek(prompt: string, options: DeepseekOptions = {}) {
  const client = createClient()

  const {
    model = "deepseek-chat",
    temperature = 0.7,
    max_tokens = 4096,
  } = options

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature,
    max_tokens,
    stream: false,
  })

  return response.choices[0]?.message?.content ?? ""
}

// --- Modular helpers ---

type ChooseOptions<T extends string> = {
  prompt: string
  choices: T[]
  options?: DeepseekOptions
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz"

export async function choose<T extends string>(
  { prompt, choices, options }: ChooseOptions<T>
): Promise<T> {
  const map = Object.fromEntries(choices.map((c, i) => [LETTERS[i], c]))
  const formatted = Object.entries(map).map(([k, v]) => `${k}) ${v}`).join("\n")
  const raw = await deepseek(
    `${prompt}\n\nChoose ONE by responding with ONLY the letter:\n${formatted}`,
    { ...options, temperature: 0 }
  )
  const letter = raw.trim().toLowerCase().replace(/[^a-z]/g, "")[0]
  return map[letter] ?? choices[0]
}

type FillOptions = {
  template: string
  options?: DeepseekOptions
}

export async function fill({ template, options }: FillOptions): Promise<string> {
  return deepseek(
    `Fill in each ___ blank. Return ONLY the completed text, nothing else.\n\n${template}`,
    { ...options, temperature: 0 }
  )
}

type ClassifyOptions<T extends string> = {
  input: string
  categories: T[]
  options?: DeepseekOptions
}

export async function classify<T extends string>(
  { input, categories, options }: ClassifyOptions<T>
): Promise<T> {
  return choose({
    prompt: `Classify this input: "${input}"`,
    choices: categories,
    options,
  })
}

type ExtractOptions = {
  input: string
  fields: string[]
  options?: DeepseekOptions
}

export async function extract(
  { input, fields, options }: ExtractOptions
): Promise<Record<string, string>> {
  const raw = await deepseek(
    `Extract these fields from the input. Respond with ONLY valid JSON, no markdown.\nFields: ${fields.join(", ")}\nInput: "${input}"`,
    { ...options, temperature: 0 }
  )
  return JSON.parse(raw.trim().replace(/```json|```/g, ""))
}

type LabelOptions = {
  input: string
  count?: number
  options?: DeepseekOptions
}

export async function label({ input, count = 3, options }: LabelOptions): Promise<string[]> {
  const raw = await deepseek(
    `Generate exactly ${count} short descriptive labels for this input. Respond with ONLY a JSON array of strings, no markdown.\nInput: "${input}"`,
    { ...options, temperature: 0 }
  )
  return JSON.parse(raw.trim().replace(/```json|```/g, ""))
}

type TagOptions = {
  input: string
  tags?: string[]
  count?: number
  options?: DeepseekOptions
}

export async function tag({ input, tags, count = 3, options }: TagOptions): Promise<string[]> {
  if (tags) {
    const map = Object.fromEntries(tags.map((t, i) => [LETTERS[i], t]))
    const formatted = Object.entries(map).map(([k, v]) => `${k}) ${v}`).join("\n")
    const raw = await deepseek(
      `Pick up to ${count} tags that apply. Respond with ONLY the letters, comma-separated.\n\nInput: "${input}"\n\nTags:\n${formatted}`,
      { ...options, temperature: 0 }
    )
    const picked = raw.trim().toLowerCase().replace(/[^a-z,]/g, "").split(",")
    return picked.map(l => map[l.trim()]).filter(Boolean)
  }

  const raw = await deepseek(
    `Generate up to ${count} short lowercase tags for this input. Respond with ONLY a JSON array of strings, no markdown.\nInput: "${input}"`,
    { ...options, temperature: 0 }
  )
  return JSON.parse(raw.trim().replace(/```json|```/g, ""))
}

type YesNoOptions = {
  prompt: string
  options?: DeepseekOptions
}

export async function yesno({ prompt, options }: YesNoOptions): Promise<boolean> {
  const result = await choose({
    prompt,
    choices: ["yes", "no"] as const,
    options,
  })
  return result === "yes"
}
