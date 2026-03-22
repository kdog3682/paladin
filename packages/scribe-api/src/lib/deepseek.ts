// @paladin/scribe-api/src/lib/deepseek.ts

const DEEPSEEK_URL = process.env.DEEPSEEK_URL || "https://api.deepseek.com/v1/chat/completions"
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || ""
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat"

export async function deepseek(prompt: string, system?: string): Promise<string> {
  const messages: { role: string, content: string }[] = []
  if (system) messages.push({ role: "system", content: system })
  messages.push({ role: "user", content: prompt })

  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 256,
    }),
  })

  const data = await res.json() as any
  return data.choices?.[0]?.message?.content?.trim() || ""
}
