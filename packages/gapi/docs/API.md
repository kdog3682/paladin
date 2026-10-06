# @paladin/gapi

Google OAuth for scripts, plus a YouTube watch-history fetcher. Bun only.

```ts
import { getAuth, SCOPES, PORTABILITY_SCOPES, fetchWatchHistory } from "@paladin/gapi"
```

## Setup

Save a Desktop-app OAuth client JSON to `~/dotfiles/gapi/credentials.json`. The first `getAuth()` opens a browser for consent. Tokens are cached in `~/.config/paladin/gapi/tokens/<profile>.json`.

## getAuth

```ts
const auth = await getAuth()                                   // all of SCOPES
const auth = await getAuth({ scopes: [SCOPES.sheets] })        // just what you need
```

Returns an OAuth2 client to pass to any `google.*` service. Tokens refresh automatically. Asking for a scope the cache lacks re-runs consent. An expired or revoked token re-runs consent too.

| Option | Default | |
|---|---|---|
| `scopes` | all of `SCOPES` | scopes needed |
| `profile` | `"default"` | separate token cache |
| `credentialsPath` | `~/dotfiles/gapi/credentials.json` | OAuth client JSON |
| `tokenPath` | `~/.config/paladin/gapi/tokens/<profile>.json` | token file |
| `forceConsent` | `false` | always run browser consent |

`SCOPES` keys: `openid email profile drive docs sheets slides forms formsResponses gmail calendar contacts tasks youtube cloud`.

## fetchWatchHistory

```ts
const auth = await getAuth({ scopes: [PORTABILITY_SCOPES.youtubeActivity], profile: "dataportability" })

const entries = await fetchWatchHistory({
  auth,
  since: new Date(Date.now() - 7 * 864e5),
  onState: s => console.error(s.state),
})
// [{ videoId, title, url, channel?, channelUrl?, source, watchedAt }, ...] oldest first
```

It starts an export job, polls until it's done, downloads it and parses it. Exports can take minutes to hours.

| Option | Default | |
|---|---|---|
| `auth` | required | client with the youtube activity scope |
| `since`, `until` | — | date range |
| `jobId` | — | resume an existing job |
| `timeRange` | `true` | send the range to the API. Set `false` for a one-time grant |
| `includeAds` | `false` | keep "From Google Ads" entries |
| `pollMs` | `15000` | poll interval |
| `timeoutMs` | 2h | give up after this long |
| `onState` | — | called after each poll |

Pick 30 or 180 day access on the consent screen, otherwise the API rejects date ranges. Use `timeRange: false` for a one-time grant.

Lower-level pieces are also exported: `initiateArchive`, `getArchiveState`, `waitForArchive`, `downloadArchive`, `parseWatchHistory`, `resetAuthorization`.
