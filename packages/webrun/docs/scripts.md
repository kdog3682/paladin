# Test scripts

`webrun path/to/name.webrun.yaml` serves the script's `app`, then runs every scenario in a fresh headless
Chrome (new browser and page load each, so scenarios can't leak state) and exits 1 if any fails.
`--switch` serves the app temporarily, like for any target; `webrun --resume` puts the old one back.

```yaml
app: Palette.examples.tsx   # relative to this file; omit to probe whatever is already running
failOnConsole: true         # default: a console error fails its scenario
timeout: 2000               # ms `expect` waits

scenarios:
  - name: opens on ctrl+k
    hash: pickerExample     # first picks #pickerExample in a name.examples.tsx gallery
    steps:
      - keypress: ctrl+k
      - expect: "[role=dialog]"
      - eval: document.querySelectorAll("[role=dialog]").length
        equals: 1
```

A step is one action, the same vocabulary as the CLI flags (`click type keypress expect eval text style rule
reload sleep hash screenshot`, see `webrun --help`), plus optional checks on the value the action produced:

| check      | passes when                                   |
| ---------- | --------------------------------------------- |
| `equals`   | the value, as a string, is exactly this       |
| `contains` | the value includes this text                  |
| `matches`  | the value matches this regex                  |

The value is `eval`'s result (strings as is, anything else as JSON), the joined text of `text` (matches
separated by ` | `), or `expect`'s `×count "text"` summary. To assert a count, `eval` a `.length`.

A failing step skips the rest of its scenario. Passing scenarios print one line; a failing one prints every
step and its console errors. Example: `packages/ui/src/command-palette/command-palette.webrun.yaml`.

Code: `src/probe/script.ts` (load, validate, run), `src/probe/run.ts` (`failedCheck`).
