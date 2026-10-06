# storylite

Renders the stories in `.stories.` files in the browser and runs their `play` functions. The page
shows every story's pass/fail, the selected story rendered live, and its steps and errors.

```
storylite [path/to/Button.stories.tsx | dir] [--open | --no-open]        # serve in the background (default dir: .)
storylite [path | dir] --test                                            # the same report from a throwaway server
```

Every call prints the report: all stories run headless, failing ones with their steps, then console
errors, warnings, failed requests and new vite-log errors (webrun's sections), exit 1 on any. The page
also runs everything on load, with portalled dialogs hidden while it does.

The server keeps running on port 6007 and its state lives in `~/.cache/paladin/storylite/state.json`.
Calling it again with the same target reuses it (nothing opens unless `--open`); with another target it
restarts onto it on the same port and the open tab reloads itself. There is no stop or resume: to see
what's running, call it again.

## Stories files

The short guide to writing them is `docs/writing-stories.md`; the summary:

Everything flows through `<name>.stories.tsx`: a default-exported meta, one named export per story.

```tsx
export default {
  // title is inferred from the path: src/components/Button.stories.tsx -> components/Button
  component: Button,
  args: { label: "Button" },
}

export const Primary = { args: { variant: "primary" } }

export const Clicked = {
  play: async ({ canvas, userEvent, expect, step }) => {
    await step("click", () => userEvent.click(canvas.getByRole("button")))
    expect(canvas.getByText("clicked")).toBeInTheDocument()
  },
}
```

- Story args are the meta's `args` overridden by the story's. `render(args)` replaces
  `<component {...args} />`; `decorators: [(Story) => <Frame><Story /></Frame>]` wrap it (the
  story's inside the meta's). A bare exported function is shorthand for `{ render: fn }`.
- Stories list in the order written. A story with no `play` is a render check: it passes if
  nothing throws.
- `play` gets `{ args, canvasElement, canvas, screen, userEvent, expect, fn, waitFor, step }`.
  `canvas` is testing-library's `within(canvasElement)`; use `screen` for portals (dialogs, menus).
  `expect` has the usual matchers plus the dom ones (`toBeInTheDocument`, `toHaveTextContent`, …);
  `fn()` is a spy. Anything thrown fails the story; `step(name, fn)` shows as one row in the results.
  `import { expect, fn, type Meta, type Story } from "@paladin/storylite"` works in a stories file too.

## Steps

A story can carry `steps`: actions and checks in webrun's yaml vocabulary (`click type keypress sleep
expect eval text`, with `equals` / `contains` / `matches`), so a webrun scenario pastes in as is.

```tsx
export const OpensOnCtrlK = {
  render: () => <Demo />,
  steps: [
    { desc: "the palette is a dialog", keypress: "ctrl+k" },
    { expect: "[role=dialog]" },
    { desc: "commands are listed", text: "[role=dialog]", contains: "Rename file" },
  ],
}
```

- They run after the story renders (and after `play`), in the page, with user-event. `expect`, `text`
  and `eval` retry for 2s before failing, so debounced results need no `sleep`; a failing step skips
  the rest. `--test` runs them like any play.
- Selectors skip storylite's own sidebar and panel, and `document` inside `eval` does too. Dialogs
  portalled to `<body>` are found.
- The page lists the steps with their `desc` (what each is testing) before anything runs. The
  **▶ play** button re-renders the story and runs them slowly (typing paced, clicks flashed, the
  current step highlighted) so you can watch the component being driven.

## How it runs

- One static vite config (`src/config.ts`) driven by a plan the CLI passes in an env var. No
  generated config or entry; the only file written is the tailwind stylesheet in
  `<project>/node_modules/.storylite/<hash>/`, along with vite's cache and `vite.log`.
- The project is the nearest `package.json` above the target. Its vite config is merged
  underneath (minus `test`/`build` blocks and plugins that start a run of their own). React is
  added when missing, and tailwind v4 when the project has it, scanning the project and the
  workspace packages it depends on, like webrun.
- The page (`src/client/`) runs the selected story live in the canvas; "run all" runs every story once in an offscreen stage, one at a time, and shows
  the results in the sidebar. The selected story re-runs live in the canvas. A change to a stories
  file reloads the page.
- `--test` loads the same page headless (`?headless`) and reads the results off
  `window.__storylite`, so the CLI and the browser always agree.

## Tests

`bun test`. The end-to-end cases serve `src/test/fixtures/` and drive headless chrome, so they take a few seconds.
