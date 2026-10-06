import type { BoundFunctions, queries, screen, waitFor } from "@testing-library/dom"
import type { UserEvent } from "@testing-library/user-event"
import type { ComponentType, ReactNode } from "react"
import type { expect, fn } from "./client/expect"

/** what a `play` function is handed */
export type PlayContext<Args = any> = {
  args: Args
  /** the element the story is rendered into */
  canvasElement: HTMLElement
  /** testing-library queries scoped to the story — `canvas.getByRole("button")` */
  canvas: BoundFunctions<typeof queries>
  /** queries over the whole page, for portals (dialogs, menus) that render outside the canvas */
  screen: typeof screen
  userEvent: UserEvent
  expect: typeof expect
  fn: typeof fn
  waitFor: typeof waitFor
  /** a named group of actions and assertions, shown as one row in the results */
  step(name: string, run: () => void | Promise<void>): Promise<void>
}

/**
 * one step of a story's `steps`: an action, plus optional checks on the value it produced. the
 * vocabulary is webrun's script format, run in the page with user-event, so a yaml scenario
 * pastes in as is. `desc` says what the step is testing and is shown next to it.
 */
export type StepDef = {
  desc?: string
  /** click the first element matching the selector */
  click?: string
  /** type into whatever has focus */
  type?: string
  /** press keys: `ctrl+k`, `Enter`, `ctrl+Enter`, `Backspace` */
  keypress?: string
  /** ms to wait (actions already settle for a beat) */
  sleep?: number
  /** wait for the selector to exist; `!sel` waits for it to be gone */
  expect?: string
  /** evaluate an expression in the page (may be async); its value is what the checks see */
  eval?: string
  /** the text of every element matching the selector, joined by ` | `; fails if none match */
  text?: string
  /** the value, as a string, is exactly this */
  equals?: string | number | boolean
  /** the value includes this text */
  contains?: string
  /** the value matches this regex */
  matches?: string
}

export type Decorator<Args = any> = (Story: ComponentType, context: { args: Args }) => ReactNode

type Shared<Args> = {
  args?: Partial<Args>
  /** draw the story yourself instead of `<component {...args} />` */
  render?: (args: Args, context: { args: Args }) => ReactNode
  /** wrap the story — a provider, a padded frame */
  decorators?: Decorator<Args>[]
}

/** the default export of a `.stories.` file */
export type Meta<Args = any> = Shared<Args> & {
  /** shown in the sidebar. default: the file's path, without `src/` and `.stories.tsx` */
  title?: string
  component?: ComponentType<any>
}

/** a named export of a `.stories.` file */
export type Story<Args = any> = Shared<Args> & {
  /** shown in the sidebar. default: the export name, spaced out */
  name?: string
  /**
   * actions and checks run in order after the story renders (and after `play`). they are the
   * story's test, listed in the page, and the play button there runs them slowly so you can
   * watch the component being driven. a failing step skips the rest.
   */
  steps?: StepDef[]
  /** runs after the story renders. a throw (a failed `expect`, a missing element) fails the story */
  play?: (context: PlayContext<Args>) => void | Promise<void>
}

export type Step = {
  name: string
  /** what the step is testing, from its `desc` */
  desc?: string
  /** `idle` hasn't run yet, or was skipped after a failure */
  status: "idle" | "running" | "pass" | "fail"
  error?: string
}

export type Result = {
  /** `<file>::<export>` */
  id: string
  file: string
  title: string
  name: string
  /** `idle` hasn't run yet; a story without a `play` still renders, and passes if nothing throws */
  status: "idle" | "running" | "pass" | "fail"
  /** whether the story has a `play` function (otherwise it is a render check only) */
  play: boolean
  ms: number
  error?: string
  /** failed once and passed on the second go, so something about it is timing-dependent */
  retried?: boolean
  steps: Step[]
}

/** what the page leaves on `window` for the CLI to read once every story has run */
export type Report = {
  done: boolean
  results: Result[]
  /** stories files that threw on import, so contributed no stories */
  errors: { file: string; error: string }[]
}
