import { authenticate } from "@google-cloud/local-auth"
import { google, type Auth } from "googleapis"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

/* full-access scopes only, they imply their readonly variants so one grant covers everything */
export const SCOPES = {
  openid: "openid",
  email: "https://www.googleapis.com/auth/userinfo.email",
  profile: "https://www.googleapis.com/auth/userinfo.profile",
  drive: "https://www.googleapis.com/auth/drive",
  docs: "https://www.googleapis.com/auth/documents",
  sheets: "https://www.googleapis.com/auth/spreadsheets",
  slides: "https://www.googleapis.com/auth/presentations",
  forms: "https://www.googleapis.com/auth/forms.body",
  formsResponses: "https://www.googleapis.com/auth/forms.responses.readonly",
  gmail: "https://mail.google.com/",
  calendar: "https://www.googleapis.com/auth/calendar",
  contacts: "https://www.googleapis.com/auth/contacts",
  tasks: "https://www.googleapis.com/auth/tasks",
  youtube: "https://www.googleapis.com/auth/youtube.force-ssl",
  cloud: "https://www.googleapis.com/auth/cloud-platform",
} as const

/* data portability scopes need their own consent (one-time or 30/180 day access), keep them in a separate profile */
export const PORTABILITY_SCOPES = {
  youtubeActivity: "https://www.googleapis.com/auth/dataportability.myactivity.youtube",
} as const

/* default grant for the "default" profile, covers every api in SCOPES */
export const ALL_SCOPES: string[] = Object.values(SCOPES)

export const CONFIG_DIR = join(homedir(), ".config", "paladin", "gapi")

export const CREDENTIALS_PATH = join(homedir(), "dotfiles", "gapi", "credentials.json")

export type GetAuthOpts = {
  /* scopes this caller needs, merged with whatever the cached token already has. default ALL_SCOPES */
  scopes?: string[]
  /* separate token cache, eg keep dataportability grants apart from docs/sheets. default "default" */
  profile?: string
  /* oauth client json downloaded from cloud console (Desktop app type). default ~/dotfiles/gapi/credentials.json */
  credentialsPath?: string
  /* where tokens are cached. default CONFIG_DIR/tokens/<profile>.json */
  tokenPath?: string
  /* ignore the cached token and always run the browser consent flow */
  forceConsent?: boolean
}

type ClientCreds = {
  clientId: string
  clientSecret: string
}

type ClientJson = {
  installed?: { client_id: string, client_secret: string }
  web?: { client_id: string, client_secret: string }
}

const readJson = async <T>(path: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T
  } catch {
    return null
  }
}

const writeJson = async (path: string, data: unknown) => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(data, null, 2), { mode: 0o600 })
}

const grantedScopes = (token: Auth.Credentials | null) => new Set(token?.scope?.split(" ").filter(Boolean) ?? [])

const loadClientCreds = async (path: string): Promise<ClientCreds> => {
  const hint = "download it from cloud console > apis & services > credentials > oauth client id (Desktop app)"
  let text: string
  try {
    text = await readFile(path, "utf8")
  } catch {
    throw new Error(`no oauth client file at ${path}. ${hint}`)
  }
  let json: ClientJson & { type?: string }
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`${path} is not valid json`)
  }
  const c = json.installed ?? json.web
  if (!c?.client_id || !c.client_secret) {
    const kind = json.type ? `a "${json.type}" key` : `json with keys [${Object.keys(json).join(", ")}]`
    throw new Error(`${path} is ${kind}, expected an oauth client ({"installed": {...}}). ${hint}`)
  }
  return { clientId: c.client_id, clientSecret: c.client_secret }
}

/*
 * get an authorized OAuth2Client, by default for ALL_SCOPES.
 * first run opens the browser consent (via @google-cloud/local-auth), then the cached token is reused and refreshed.
 * asking for a scope the cache doesn't have re-runs consent with the union of scopes
 */
export const getAuth = async (opts: GetAuthOpts = {}): Promise<Auth.OAuth2Client> => {
  const scopes = opts.scopes ?? ALL_SCOPES
  const profile = opts.profile ?? "default"
  const credentialsPath = opts.credentialsPath ?? CREDENTIALS_PATH
  const tokenPath = opts.tokenPath ?? join(CONFIG_DIR, "tokens", `${profile}.json`)
  const creds = await loadClientCreds(credentialsPath)

  const cached = opts.forceConsent ? null : await readJson<Auth.Credentials>(tokenPath)
  const granted = grantedScopes(cached)
  const useCache = !!cached?.refresh_token && scopes.every(s => granted.has(s))

  let token: Auth.Credentials
  if (useCache && cached) {
    token = cached
  } else {
    const authed = await authenticate({
      keyfilePath: credentialsPath,
      scopes: [...new Set([...granted, ...scopes])],
    })
    // google only issues a refresh token on first consent, keep the old one if none came back
    token = { ...authed.credentials, refresh_token: authed.credentials.refresh_token ?? cached?.refresh_token }
    if (!token.refresh_token) {
      throw new Error("no refresh token returned (google only issues one on first consent). remove the app at myaccount.google.com/permissions and retry")
    }
    await writeJson(tokenPath, token)
  }

  const client = new google.auth.OAuth2(creds.clientId, creds.clientSecret)
  client.setCredentials(token)
  client.on("tokens", async fresh => {
    const current = await readJson<Auth.Credentials>(tokenPath) ?? {}
    await writeJson(tokenPath, { ...current, ...fresh, refresh_token: fresh.refresh_token ?? current.refresh_token })
  })

  // refresh tokens die after 7 days for apps in "Testing" status, or when revoked. re-consent instead of failing later
  if (useCache) {
    try {
      await client.getAccessToken()
    } catch (err) {
      if (!String(err).includes("invalid_grant")) throw err
      return getAuth({ ...opts, forceConsent: true })
    }
  }

  return client
}
