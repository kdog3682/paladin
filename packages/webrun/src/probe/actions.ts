import { int, type Kwarg, type SeqItem } from "@paladin/utils"

/** the whole action vocabulary. The flags, the help text and `Action` all come from this. */
export const ACTIONS = {
  click: { seq: true, arg: "sel", eg: "'[data-slot=command-item]'", help: "click an element" },
  type: { seq: true, arg: "text", eg: "'hello'", help: "type into whatever has focus" },
  keypress: {
    seq: true,
    arg: "combo",
    eg: "alt+f",
    help: "press keys: alt+f, cmd+alt+shift+f, Enter, ArrowDown",
  },
  expect: { seq: true, arg: "sel", eg: "'[role=dialog]'", help: "wait for the selector to exist" },
  eval: {
    seq: true,
    arg: "js",
    eg: "'document.title'",
    help: "evaluate an expression in the page (may be async)",
  },
  text: {
    seq: true,
    arg: "sel",
    eg: "body",
    help: "print the text of every element matching the selector (fails if none match)",
  },
  style: {
    seq: true,
    arg: "sel",
    eg: "'kbd => font-size,border-color'",
    help: "print computed styles of the matches (first 5); `sel => prop,prop` picks the properties, default is font, color, background, border, size, padding",
  },
  rule: {
    seq: true,
    arg: "class",
    eg: "'divide-border/30'",
    help: "why a class does nothing: how many elements carry it and which stylesheet rules mention it (fails if none do, i.e. it was never generated)",
  },
  reload: {
    seq: true,
    arg: "ms",
    eg: "10000",
    parse: int({ min: 0 }),
    help: "wait up to ms for the page to reload itself, e.g. while another terminal swaps the app (fails if it doesn't)",
  },
  sleep: {
    seq: true,
    arg: "ms",
    eg: "500",
    parse: int({ min: 0 }),
    help: "wait (clicks, types and keypresses already wait 300ms)",
  },
  hash: {
    seq: true,
    arg: "name",
    eg: "pickerExample",
    help: "go to #name: picks an example in a name.examples.tsx gallery",
  },
  screenshot: { seq: true, arg: "path", eg: "/tmp/shot.png", help: "save a screenshot" },
} as const satisfies Record<string, Kwarg>

export type ActionKey = keyof typeof ACTIONS

/** one action, as a single-key object: `{click: "..."}`, `{sleep: 500}` */
export type Action = SeqItem<typeof ACTIONS>

/**
 * what a step in a script may assert about the value its action produced
 * (eval's result, the joined text of `text`, the detail of `expect`), all compared as strings
 */
export type Check = {
  equals?: string | number | boolean
  contains?: string
  matches?: string
}

/** an action plus optional assertions, which is what a yaml script step is */
export type Step = Action & Check

export const CHECK_KEYS = ["equals", "contains", "matches"] as const satisfies (keyof Check)[]

export const ACTION_KEYS = Object.keys(ACTIONS) as ActionKey[]
