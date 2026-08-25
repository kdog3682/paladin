/**
 * Provider registry. Each entry is OpenAI-compatible.
 * Model IDs current as of June 2026 — re-check provider docs as they ship new ones.
 */
export const PROVIDERS = {
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
      high: "glm-5.3",
      medium: "glm-5.2",
      low: "glm-4.5-flash",
    },
  },
  moonshot: {
    baseURL: "https://api.moonshot.ai/v1",
    apiKeyEnv: "MOONSHOT_API_KEY",
    models: {
      high: "kimi-k3",
      medium: "kimi-k2.6",
      low: "kimi-k2.7-code",
    },
  },
} satisfies Record<
  string,
  {
    baseURL: string
    apiKeyEnv: string
    // one model per effort level
    models: Record<"high" | "medium" | "low", string>
  }
>
