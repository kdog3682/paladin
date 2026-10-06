import { useEffect, useState } from "react"
import { Button } from "@paladin/shadcn"
import type { Meta, Story } from "@paladin/storylite"
import { CommandPalette } from "./components/CommandPalette"
import { PaletteProvider } from "./context"
import { createPalette, type PaletteInstance } from "./createPalette"
import { createDefiners, itemEntry } from "./define"
import { isMac } from "./keys"
import { fuzzyFilter } from "./rank"
import { sleep } from "./search"
import type { Completion, OpenOptions, PaletteCommand, SearchProvider } from "./types"

/* ---------- stubs ---------- */

type DemoCtx = { user: string }
type DemoResult = { message: string }

const { defineAction, defineArgs, defineList, defineText } = createDefiners<DemoCtx, DemoResult>()

const FRUITS = ["apple", "apricot", "banana", "blueberry", "cherry", "grape", "lemon", "mango", "peach", "pear"]
const FILES = ["src/index.ts", "src/app.tsx", "src/lib/math.ts", "src/lib/path.ts", "README.md", "package.json"]
const PROJECTS = [
  { id: "paladin", status: "active" },
  { id: "mathpen", status: "suspended" },
  { id: "old-blog", status: "archived" },
]

/* local provider: no debounce */
const fruitProvider: SearchProvider<DemoCtx, DemoResult> = {
  id: "fruit",
  group: "Fruit",
  limit: 4,
  search: async (query) =>
    fuzzyFilter(query, FRUITS, (f) => f).map(({ item, score }) => ({
      id: item,
      title: item,
      score,
      onSelect: () => ({ message: `picked ${item}` }),
    })),
}

/* slow "backend" provider: debounced and delayed, cancels on abort */
const fileProvider: SearchProvider<DemoCtx, DemoResult> = {
  id: "files",
  group: "Files",
  limit: 5,
  debounce: 150,
  search: async (query, _ctx, signal) => {
    await sleep(400, signal)
    if (!query.trim()) return []
    return fuzzyFilter(query, FILES, (f) => f).map(({ item, score }) => ({
      id: item,
      title: item.split("/").pop() ?? item,
      subtitle: item,
      score,
      onSelect: () => ({ message: `opened ${item}` }),
    }))
  },
}

const LABELS = ["bug", "docs", "perf", "ui", "refactor", "urgent"]

const completeFruit = async (partial: string, signal?: AbortSignal): Promise<Completion[]> => {
  await sleep(60, signal)
  return fuzzyFilter(partial, FRUITS, (f) => f).map(({ item }) => ({ value: item }))
}

const completeLabel = async (partial: string): Promise<Completion[]> =>
  fuzzyFilter(partial, LABELS, (l) => l).map(({ item }) => ({ value: item }))

const completeFile = async (partial: string, signal?: AbortSignal): Promise<Completion[]> => {
  await sleep(80, signal)
  return fuzzyFilter(partial, FILES, (f) => f).map(({ item }) => ({ value: item }))
}

const seedCommands = [
  defineAction({
    id: "greet",
    title: "Say hello",
    keywords: ["hello", "greet"],
    group: "Basics",
    run: (ctx) => ({ message: `hello ${ctx.user}` }),
  }),
  defineText({
    id: "note",
    title: "Note",
    keywords: ["note"],
    group: "Basics",
    placeholder: "Write a note…",
    validate: (t) => (t.trim() ? undefined : "The note is empty"),
    run: (text) => ({ message: `note saved: ${text}` }),
  }),
  defineArgs({
    id: "rename",
    title: "Rename file",
    keywords: ["rename", "mv"],
    group: "Files",
    args: [
      {
        name: "from",
        placeholder: "path",
        required: true,
        strict: true,
        nextOnEnter: true,
        complete: (p, _prev, _ctx, s) => completeFile(p, s),
      },
      {
        name: "to",
        placeholder: "new-path",
        required: true,
        complete: (p, prev, _ctx, s) => completeFile(p || prev.from, s),
      },
    ],
    run: ({ from, to }) => ({ message: `renamed ${from} → ${to}` }),
  }),
  defineArgs({
    id: "fruits",
    title: "Pick fruits",
    keywords: ["fruits", "basket"],
    group: "Basics",
    args: [
      { name: "fruits", placeholder: "fruit", multiple: true, required: true, strict: true, complete: (p, _prev, _ctx, s) => completeFruit(p, s) },
      { name: "to", placeholder: "person", required: true, nextOnEnter: true, complete: async (p) => ["ann", "bo", "cy"].filter((n) => n.startsWith(p)).map((value) => ({ value })) },
    ],
    run: (_values, _ctx, { fruits }) => ({ message: `basket: ${fruits.join(", ")}` }),
  }),
  defineArgs({
    id: "tag",
    title: "Tag files",
    keywords: ["tag", "label"],
    group: "Files",
    args: [
      { name: "files", placeholder: "file", multiple: true, required: true, strict: true, color: "cyan", complete: (p, _prev, _ctx, s) => completeFile(p, s) },
      { name: "labels", placeholder: "label", multiple: true, color: "rose", complete: (p) => completeLabel(p) },
      { name: "note", placeholder: "note", color: "amber" },
    ],
    run: (_values, _ctx, { files, labels }) => ({
      message: `tagged ${files.length} file(s) with ${labels.length ? labels.join(", ") : "nothing"}`,
    }),
  }),
  defineList({
    id: "fruit",
    title: "Pick a fruit",
    keywords: ["fruit"],
    group: "Basics",
    items: async (query) =>
      fuzzyFilter(query, FRUITS, (f) => f).map(({ item }) =>
        itemEntry({ id: item, title: item, onSelect: () => ({ message: `fruit: ${item}` }) }),
      ),
  }),
  defineList({
    id: "status",
    title: "Set project status",
    keywords: ["status", "set status"],
    group: "Projects",
    /* drill-down: each entry is itself a list command */
    items: async (query) =>
      fuzzyFilter(query, PROJECTS, (p) => p.id).map(({ item: project }) => ({
        kind: "command" as const,
        command: defineList({
          id: `status:${project.id}`,
          title: project.id,
          keywords: [project.id],
          items: async () =>
            ["active", "suspended", "archived"].map((status) =>
              itemEntry({
                id: status,
                title: status,
                subtitle: status === project.status ? "current" : undefined,
                onSelect: () => ({ message: `${project.id} → ${status}` }),
              }),
            ),
        }),
      })),
  }),
  defineAction({
    id: "explode",
    title: "Throw an error",
    keywords: ["explode", "error"],
    group: "Errors",
    run: async () => {
      await sleep(200)
      throw new Error("Something went wrong; the palette stays open")
    },
  }),
]

function createDemoPalette(
  onDone: (message: string) => void,
  commands: PaletteCommand<DemoCtx, DemoResult>[],
  providers: SearchProvider<DemoCtx, DemoResult>[],
) {
  const palette = createPalette<DemoCtx, DemoResult>({
    getContext: () => ({ user: "kdog" }),
    onDone: (result) => onDone(result ? result.message : "(no result)"),
    getShortcut: (id) => (id === "greet" ? "⌘⇧H" : undefined),
  })
  palette.registerCommands(commands)
  for (const provider of providers) palette.registerProvider(provider)
  return palette
}

/* ---------- demo shell ---------- */

type DemoProps = {
  /* which commands and providers this demo registers; defaults to all of them */
  commands?: PaletteCommand<DemoCtx, DemoResult>[]
  providers?: SearchProvider<DemoCtx, DemoResult>[]
  /* what Cmd+K opens */
  openOptions?: OpenOptions
  /* extra buttons that open with other options */
  presets?: { label: string; options: OpenOptions }[]
}

function Demo({
  openOptions,
  presets = [],
  commands = seedCommands,
  providers = [fruitProvider, fileProvider],
}: DemoProps) {
  const [log, setLog] = useState<string[]>([])
  const [palette] = useState<PaletteInstance<DemoCtx, DemoResult>>(() =>
    createDemoPalette((message) => setLog((l) => [message, ...l].slice(0, 6)), commands, providers),
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac() ? e.metaKey : e.ctrlKey
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault()
        palette.open(openOptions)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [palette, openOptions])

  return (
    <PaletteProvider palette={palette}>
      <div data-demo className="flex max-w-lg flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => palette.open(openOptions)}>
            Open palette (⌘K)
          </Button>
          {presets.map((preset) => (
            <Button key={preset.label} size="sm" variant="outline" onClick={() => palette.open(preset.options)}>
              {preset.label}
            </Button>
          ))}
        </div>
        <textarea
          placeholder="Focus here, open the palette, then close it: focus comes back here"
          className="h-20 rounded-md border p-2 text-sm"
        />
        <ul data-log className="text-muted-foreground font-mono text-xs">
          {log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>
      <CommandPalette />
    </PaletteProvider>
  )
}

/* ---------- stories ---------- */

export default { title: "CommandPalette" } satisfies Meta

const byId = (...ids: string[]) => seedCommands.filter((c) => ids.includes(c.id))

/* everything on one root page: an action, text, args, lists and both providers. try "note hi", "rename ", "status " */
const everything = () => <Demo />

/* the Cmd+P style picker: providers only, no commands */
const picker = () => (
  <Demo commands={[]} openOptions={{ providers: ["fruit", "files"], commands: false, placeholder: "Go to file or fruit…" }} />
)

/* colored chips per arg: <path> <new-path>. Enter on a completion moves on (nextOnEnter), Backspace on an empty input deletes the previous chip */
const argChips = () => (
  <Demo
    commands={byId("rename", "note")}
    providers={[]}
    openOptions={{ command: "rename" }}
    presets={[{ label: "Rename (empty)", options: { command: "rename" } }]}
  />
)

/* multiple: several fruits as chips, then a person. Enter picks, Enter on an empty input moves on */
const multiSelect = () => (
  <Demo
    commands={byId("fruits", "tag")}
    providers={[]}
    openOptions={{ command: "fruits" }}
    presets={[{ label: "Tag files", options: { command: "tag" } }]}
  />
)

/* error paths: a throwing action, a strict arg with a bad value, a missing required arg */
const errors = () => (
  <Demo
    commands={byId("explode", "rename", "note")}
    providers={[]}
    presets={[
      { label: "Throwing action", options: { command: "explode" } },
      { label: "Strict arg", options: { command: "rename", initialQuery: "not-a-file.ts" } },
      { label: "Empty note", options: { command: "note" } },
    ]}
  />
)

/* root page lists commands and opens on ctrl+k */
export const RootPageListsCommandsAndOpensOnCtrlK: Story = {
  name: "root page lists commands and opens on ctrl+k",
  render: everything,
  steps: [
    { keypress: "ctrl+k" },
    { desc: "the palette opens as a dialog", expect: "[role=dialog]" },
    { desc: "commands from the registry are listed", text: "[role=dialog]", contains: "Rename file" },
    { desc: "an args command shows its arg labels", text: "[role=dialog]", contains: "<path> <new-path>" },
  ],
}

/* escape closes the palette */
export const EscapeClosesThePalette: Story = {
  name: "escape closes the palette",
  render: everything,
  steps: [
    { keypress: "ctrl+k" },
    { expect: "[role=dialog]" },
    { keypress: "Escape" },
    { desc: "gone from the DOM, not just hidden", expect: "![role=dialog]" },
  ],
}

/* only the shown example reacts to ctrl+k */
export const OnlyTheShownExampleReactsToCtrlK: Story = {
  name: "only the shown example reacts to ctrl+k",
  render: picker,
  steps: [
    { keypress: "ctrl+k" },
    { desc: "one palette, not one per story on the page", eval: "document.querySelectorAll(\"[role=dialog]\").length", equals: 1 },
  ],
}

/* an action runs from the root page */
export const AnActionRunsFromTheRootPage: Story = {
  name: "an action runs from the root page",
  render: everything,
  steps: [
    { keypress: "ctrl+k" },
    { type: "Say hello" },
    { keypress: "Enter" },
    { desc: "the action ran with the context's user", text: "[data-log]", contains: "hello kdog" },
  ],
}

/* a text command via its keyword, submitted with ctrl+enter */
export const ATextCommandViaItsKeywordSubmittedWithCtrlEnter: Story = {
  name: "a text command via its keyword, submitted with ctrl+enter",
  render: everything,
  steps: [
    { keypress: "ctrl+k" },
    { type: "note remember this" },
    { expect: "[role=dialog] textarea, [role=dialog] input" },
    { keypress: "ctrl+Enter" },
    { desc: "the text became the note's argument", text: "[data-log]", contains: "note saved: remember this" },
  ],
}

/* picker finds a fruit across providers */
export const PickerFindsAFruitAcrossProviders: Story = {
  name: "picker finds a fruit across providers",
  render: picker,
  steps: [
    { keypress: "ctrl+k" },
    { type: "app" },
    { desc: "a provider result is offered", text: "[role=dialog]", contains: "apple" },
    { keypress: "Enter" },
    { desc: "selecting it ran its onSelect", text: "[data-log]", contains: "picked apple" },
  ],
}

/* chips, nextOnEnter and a full rename */
export const ChipsNextOnEnterAndAFullRename: Story = {
  name: "chips, nextOnEnter and a full rename",
  render: argChips,
  steps: [
    { keypress: "ctrl+k" },
    { desc: "the first arg is active on open", expect: "[data-arg=from][data-active=true]" },
    { desc: "the active arg shows its placeholder", eval: "document.querySelector(\"[data-arg=from] input\").placeholder", equals: "<path>" },
    { desc: "inactive args show their label", text: "[data-arg=to]", equals: "<new-path>" },
    { type: "src/in" },
    { keypress: "Enter" },
    { expect: "[data-arg=to][data-active=true]" },
    { desc: "the accepted completion became a chip; nextOnEnter moved on", text: "[data-chip=from]", equals: "src/index.ts" },
    { type: "src/lib/m" },
    { keypress: "Enter" },
    { keypress: "Enter" },
    { desc: "both args were passed to run", text: "[data-log]", contains: "renamed src/index.ts → src/lib/math.ts" },
  ],
}

/* backspace on an empty input deletes the previous chip and returns to it */
export const BackspaceOnAnEmptyInputDeletesThePreviousChipAndReturnsToIt: Story = {
  name: "backspace on an empty input deletes the previous chip and returns to it",
  render: argChips,
  steps: [
    { keypress: "ctrl+k" },
    { type: "README" },
    { keypress: "Enter" },
    { expect: "[data-arg=to][data-active=true]" },
    { desc: "the first arg's chip is there", eval: "document.querySelectorAll(\"[data-chip]\").length", equals: 1 },
    { keypress: "Backspace" },
    { expect: "[data-arg=from][data-active=true]" },
    { desc: "that chip is gone", eval: "document.querySelectorAll(\"[data-chip]\").length", equals: 0 },
  ],
}

/* multiple fruits become chips; backspace removes the last one */
export const MultipleFruitsBecomeChipsBackspaceRemovesTheLastOne: Story = {
  name: "multiple fruits become chips; backspace removes the last one",
  render: multiSelect,
  steps: [
    { keypress: "ctrl+k" },
    { type: "ap" },
    { keypress: "Enter" },
    { type: "ba" },
    { keypress: "Enter" },
    { desc: "both fruits are chips", eval: "[...document.querySelectorAll('[data-chip=fruits]')].map(e => e.textContent).join(',')", equals: "apple,banana" },
    { desc: "an unpicked fruit is still offered", text: "[role=listbox]", contains: "apricot" },
    { desc: "a picked fruit is not offered again", eval: "document.querySelector(\"[role=listbox]\").textContent.includes(\"banana\")", equals: false },
    { keypress: "Backspace" },
    { desc: "only the last chip went", eval: "[...document.querySelectorAll('[data-chip=fruits]')].map(e => e.textContent).join(',')", equals: "apple" },
  ],
}

/* multiple fruits submit with the list */
export const MultipleFruitsSubmitWithTheList: Story = {
  name: "multiple fruits submit with the list",
  render: multiSelect,
  steps: [
    { keypress: "ctrl+k" },
    { type: "ch" },
    { keypress: "Enter" },
    { type: "gr" },
    { keypress: "Enter" },
    { keypress: "Enter" },
    { expect: "[data-arg=to][data-active=true]" },
    { type: "a" },
    { keypress: "Enter" },
    { desc: "the picked list was passed to run", text: "[data-log]", contains: "basket: cherry, grape" },
  ],
}

/* tag files uses a different color per arg */
export const TagFilesUsesADifferentColorPerArg: Story = {
  name: "tag files uses a different color per arg",
  render: multiSelect,
  steps: [
    { desc: "nothing is open before the click", eval: "document.querySelectorAll(\"[role=dialog]\").length", equals: 0 },
    { click: "[data-demo] button:nth-of-type(2)" },
    { expect: "[role=dialog]" },
    { type: "src/in" },
    { keypress: "Enter" },
    { desc: "each arg has its own color", eval: "document.querySelector(\"[data-chip=files]\").className.includes(\"cyan\")", equals: true },
    { desc: "an optional multiple arg is bracketed with dots", text: "[data-arg=labels]", equals: "[label...]" },
    { desc: "an optional arg is bracketed", text: "[data-arg=note]", equals: "[note]" },
  ],
}

/* strict arg rejects a value that is not a completion */
export const StrictArgRejectsAValueThatIsNotACompletion: Story = {
  name: "strict arg rejects a value that is not a completion",
  render: errors,
  steps: [
    { click: "[data-demo] button:nth-of-type(3)" },
    { expect: "[role=dialog]" },
    { keypress: "ctrl+Enter" },
    { desc: "a value that isn't a completion is refused", text: "[role=alert]", contains: "Pick" },
  ],
}

/* a throwing action shows its error and keeps the palette open */
export const AThrowingActionShowsItsErrorAndKeepsThePaletteOpen: Story = {
  name: "a throwing action shows its error and keeps the palette open",
  render: errors,
  steps: [
    { click: "[data-demo] button:nth-of-type(2)" },
    { expect: "[role=alert]" },
    { desc: "the error from run is shown", text: "[role=alert]", contains: "Something went wrong" },
    { desc: "the palette stays open after it", expect: "[role=dialog]" },
  ],
}

/* an empty note is refused */
export const AnEmptyNoteIsRefused: Story = {
  name: "an empty note is refused",
  render: errors,
  steps: [
    { click: "[data-demo] button:nth-of-type(4)" },
    { expect: "[role=dialog]" },
    { keypress: "ctrl+Enter" },
    { desc: "validate's message is shown", text: "[role=alert]", contains: "The note is empty" },
  ],
}
