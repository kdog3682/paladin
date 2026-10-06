# Writing stories

A `Name.stories.tsx` file is a default-exported meta plus one named export per story. Run it with
`storylite path/to/Name.stories.tsx` (see the README for what the command reports).

```tsx
import type { Meta, Story } from "@paladin/storylite"
import { Button } from "./Button"

export default { component: Button, args: { label: "Save" } } satisfies Meta

export const Primary: Story = { args: { variant: "primary" } }

export const Clicked: Story = {
  steps: [
    { click: "button" },
    { desc: "the click is counted", text: "button", equals: "Saved: 1" },
  ],
}
```

## Meta (default export)

| field        | meaning                                                              |
| ------------ | -------------------------------------------------------------------- |
| `component`  | rendered as `<component {...args} />` when a story has no `render`   |
| `args`       | props shared by every story, overridden by the story's own           |
| `render`     | draw it yourself: `(args) => <Frame><Button {...args} /></Frame>`    |
| `decorators` | wrap every story: `[(Story) => <Provider><Story /></Provider>]`      |
| `title`      | sidebar group. Default: the path without `src/` and `.stories.tsx`   |

## Story (named exports)

Same `args`, `render` and `decorators` (the story's sit inside the meta's), plus:

- `name`: sidebar label. Default: the export name, spaced out (`StartsAtFive` -> "Starts At Five").
- `steps`: the story's test and its walkthrough, described below.
- `play`: code instead of data, for when steps can't say it.

A bare exported function is shorthand for `{ render: fn }`. Stories list in the order written.
A story with neither `steps` nor `play` is a render check: it passes if nothing throws.

Several stories can share one demo: define `const demo = () => <Demo />` and use `render: demo` in each.

## Steps

Each step is one action, plus optional checks on the value it produced. This is webrun's script
vocabulary, so a webrun yaml scenario pastes in as is.

| action     | does                                                                          |
| ---------- | ----------------------------------------------------------------------------- |
| `click`    | click the first element matching the selector                                 |
| `type`     | type into whatever has focus                                                  |
| `keypress` | `ctrl+k`, `Enter`, `ctrl+Enter`, `Backspace`, `Escape`                        |
| `expect`   | wait for the selector to exist; `"!sel"` waits for it to be gone              |
| `eval`     | evaluate an expression (may be async); its value is what the checks see       |
| `text`     | text of every match, joined by ` \| `; fails if none match                    |
| `sleep`    | ms; rarely needed                                                             |

Checks: `equals` (exact, as a string), `contains`, `matches` (a regex). `desc` says what the step is
testing and is shown next to it.

- `expect`, `text` and `eval` retry for 2s, so debounced or async results need no `sleep`. Click, type and
  keypress wait a beat on their own.
- Selectors search the whole page, so dialogs and menus portalled to `<body>` are found. Storylite's own
  sidebar and panel are skipped, in `eval`'s `document` too.
- A failing step skips the rest of the story.
- Steps don't run when you pick a story, only on **▶ play** (slowly, so you can watch), on "run all", and
  in the CLI report.

## Play functions

```tsx
export const Increments: Story = {
  play: async ({ canvas, userEvent, expect, step }) => {
    await step("click twice", async () => {
      await userEvent.click(canvas.getByRole("button"))
      await userEvent.click(canvas.getByRole("button"))
    })
    expect(canvas.getByRole("button")).toHaveTextContent("Clicks: 2")
  },
}
```

`play` gets `{ args, canvasElement, canvas, screen, userEvent, expect, fn, waitFor, step }`. `canvas` is
testing-library's `within(canvasElement)`; use `screen` for portals. `fn()` is a spy; `step(name, fn)` shows
as a row in the results. Anything thrown fails the story. `play` runs before `steps`.

## Tips

- Give the thing you assert on a stable hook (`data-log`, `data-chip=from`, `role=alert`) instead of
  styling classes.
- Only one story is mounted at a time, so global listeners (hotkeys) don't collide, but don't leave
  state on `window` for the next one.
- Stories are checked with the CLI, not the type checker: `storylite file --test` for a one-off report.
