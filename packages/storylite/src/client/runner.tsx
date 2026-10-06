import { screen, waitFor, within } from "@testing-library/dom"
import userEvent from "@testing-library/user-event"
import { Component, createElement } from "react"
import type { ComponentType, ReactNode } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import type { PlayContext, Result, Step } from "../types"
import { expect, fn } from "./expect"
import type { Story } from "./model"
import { exec, labelOf } from "./steps"

/** a play that never settles shouldn't hang the whole run */
const PLAY_TIMEOUT = 10_000

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** catches a throwing story, shows it in the canvas, and reports it so the run can fail */
class Boundary extends Component<{ onError: (error: Error) => void; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    this.props.onError(error)
  }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return createElement("pre", { style: { color: "#b91c1c", whiteSpace: "pre-wrap", margin: 0 } }, error.stack ?? String(error))
  }
}

/** the story as one component: render (the story's, else the meta's, else `<component />`) inside its decorators */
function frame(story: Story, args: Record<string, unknown>): ComponentType {
  const { meta, def } = story
  const render = def.render ?? meta.render
  const context = { args }

  // a component, not a call, so a render that uses hooks has a component to live in
  let Inner: ComponentType = () => {
    if (render) return render(args, context) as ReactNode
    if (meta.component) return createElement(meta.component, args)
    throw new Error("nothing to render: the story has no `render` and the file's default export has no `component`")
  }
  // the story's own decorators sit inside the file's, as in storybook
  for (const decorate of [...(def.decorators ?? []), ...(meta.decorators ?? [])]) {
    const Wrapped = Inner
    Inner = () => decorate(Wrapped, context) as ReactNode
  }
  return Inner
}

/** a story's `steps` as the rows the results list before anything has run */
export function plannedSteps(story: Story): Step[] {
  return (story.def.steps ?? []).map((def) => ({ name: labelOf(def), desc: def.desc, status: "idle" }))
}

/** ms a step waits for what it checks, and the pause between steps when someone is watching */
const STEP_TIMEOUT = 2_000
const WATCH_PAUSE = 400

/** a step that never settles (a hung await, a handler that swallowed the keypress) fails instead of stalling the run */
function withinStep(task: Promise<void>, slow: boolean) {
  const limit = STEP_TIMEOUT * 3 + (slow ? 10_000 : 0)
  let timer: ReturnType<typeof setTimeout>
  const stuck = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`the step did not finish within ${limit / 1000}s`)), limit)
  })
  return Promise.race([task, stuck]).finally(() => clearTimeout(timer))
}

export type Run = {
  result: Result
  /** unmount the story. the canvas keeps what rendered until this is called, so it can be looked at */
  dispose(): void
}

/**
 * render a story into `container` and run its play function.
 *
 * never throws: a failed render, a failed assertion and a timeout all come back as
 * `status: "fail"` with the message. `drive: false` only renders: the story's `play` and `steps` wait
 * for someone to ask (the play button, the CLI). `onUpdate` sees the result at the start and as
 * each step finishes, which is what lets a slow play show its progress.
 */
export async function run(story: Story, container: HTMLElement, onUpdate?: (result: Result) => void, { slow = false, drive = true } = {}): Promise<Run> {
  const { def } = story
  // what `play` reports through step(), then the story's `steps`, which are listed before they run
  const played: Step[] = []
  const planned = plannedSteps(story)
  const steps: Step[] = []
  const sync = () => steps.splice(0, steps.length, ...played, ...planned)
  sync()
  const result: Result = {
    id: story.id,
    file: story.file,
    title: story.title,
    name: story.name,
    status: "running",
    play: typeof def.play === "function" || planned.length > 0,
    ms: 0,
    steps,
  }
  const start = performance.now()
  const emit = () => {
    sync()
    result.ms = Math.round(performance.now() - start)
    onUpdate?.({ ...result, steps: steps.map((s) => ({ ...s })) })
  }

  const errors: Error[] = []
  const root = createRoot(container)
  const dispose = () => root.unmount()
  emit()

  try {
    const args = { ...story.meta.args, ...def.args }
    const Story = frame(story, args)
    // synchronous, so the dom is there when play starts
    flushSync(() => root.render(createElement(Boundary, { onError: (e) => errors.push(e) }, createElement(Story))))
    await tick()
    if (errors.length) throw errors[0]

    if (def.play && drive) {
      const context: PlayContext = {
        args,
        canvasElement: container,
        canvas: within(container),
        screen,
        userEvent: userEvent.setup({ delay: slow ? 70 : 0 }),
        expect,
        fn,
        waitFor,
        async step(name, body) {
          const step: Step = { name, status: "running" }
          played.push(step)
          emit()
          try {
            await body()
            step.status = "pass"
          } catch (err) {
            step.status = "fail"
            step.error = message(err)
            throw err
          } finally {
            emit()
          }
        },
      }
      let timer: ReturnType<typeof setTimeout>
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`play did not finish within ${PLAY_TIMEOUT / 1000}s`)), PLAY_TIMEOUT)
      })
      try {
        await Promise.race([def.play(context), timeout])
      } finally {
        clearTimeout(timer!)
      }
      // an error thrown while the play drove the ui (a handler, an effect) is the story's failure too
      if (errors.length) throw errors[0]
    }

    if (planned.length && drive) {
      const env = { userEvent: userEvent.setup({ delay: slow ? 70 : 0 }), timeout: STEP_TIMEOUT, slow }
      for (const [i, step] of planned.entries()) {
        if (slow) await new Promise((resolve) => setTimeout(resolve, WATCH_PAUSE))
        step.status = "running"
        emit()
        try {
          await withinStep(exec(def.steps![i]!, env), slow)
          step.status = "pass"
        } catch (err) {
          step.status = "fail"
          step.error = message(err)
          emit()
          throw new Error(`step ${i + 1} (${step.name}) failed: ${step.error}`)
        }
        emit()
      }
      if (errors.length) throw errors[0]
    }
    result.status = "pass"
  } catch (err) {
    result.status = "fail"
    result.error = message(err)
  }
  emit()
  result.ms = Math.round(performance.now() - start)
  return { result: { ...result, steps: steps.map((s) => ({ ...s })) }, dispose }
}
