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
  screenshot: { seq: true, arg: "path", eg: "/tmp/shot.png", help: "save a screenshot" },
} as const satisfies Record<string, Kwarg>

export type ActionKey = keyof typeof ACTIONS

/** one action, as a single-key object: `{click: "..."}`, `{sleep: 500}` */
export type Action = SeqItem<typeof ACTIONS>

export const ACTION_KEYS = Object.keys(ACTIONS) as ActionKey[]
