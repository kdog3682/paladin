# chromext

Convention-based builder for Chrome MV3 extensions. Each extension lives in `src/<name>/`.

```
bun src/build.ts <name>          minified production build
bun src/build.ts <name> --dev    unminified, inline sourcemaps
```

`<name>` is required. Or programmatically:

```ts
import {build} from './build'

const {manifest, dist, unpacked, zip} = await build({name: 'history', dev: false, zip: false})
```

`src/build.demo.ts` builds `history` and prints the result.

## Options

| option  | default          | meaning                                                   |
| ------- | ---------------- | --------------------------------------------------------- |
| `name`  | required         | the `src/<name>` dir to build, also the output name       |
| `dev`   | `false`          | skip minification, inline sourcemaps                      |
| `dldir` | `$DLDIR`         | where to copy the result, `false` skips packing           |
| `zip`   | `false`          | also write `<dldir>/<name>.zip` (via fflate)              |
| `root`  | package root     | package root containing `src/`                            |

## Output

- `dist/<name>`: the build, including `manifest.json`
- `<dldir>/<name>`: copy to use with "load unpacked"
- `<dldir>/<name>.zip`: only with `zip: true`

## Discovery

Entrypoints in `src/<name>/`, all optional. With none, a bare `background.ts` is scaffolded.

- `background.ts`: service worker (esm)
- `content.ts` or `content/*.ts`, `content/<name>/index.ts`: content scripts (iife)
- `popup`, `options`, `sidepanel`, `newtab`, `devtools`: `<page>.html`, `<page>/index.html`, or a `.ts` entry (an html shell is generated)
- `public/`: copied verbatim; `icon-<size>.png` or `icons/icon<size>.png` become manifest icons
- `ext.config.ts`: default export a partial manifest, deep merged last. `permissions` are added to detected ones, `omitPermissions` removes any

Content scripts read metadata from leading comments (`matches` defaults to `<all_urls>`):

```ts
// @matches https://github.com/*, https://gist.github.com/*
// @exclude_matches https://github.com/settings/*
// @run_at document_start
// @all_frames
// @world MAIN
```

A sibling `<name>.css` is injected with its content script.

## Permissions

Inferred by scanning the bundle for `chrome.*` usage. `host_permissions` defaults to `<all_urls>` when an API needing host access is used (`scripting`, `cookies`, `webRequest`, `tabs.captureVisibleTab`).

## Extensions

- `history`: toolbar click saves the last 7 days of browser history as json.
