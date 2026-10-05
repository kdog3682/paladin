import { cn, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@paladin/shadcn"
import { HelpPalette, type HelpItem } from "@paladin/ui"
import { icons } from "lucide-react"
import { useMemo, type ReactNode } from "react"
import { COMMANDS } from "../commands/registry"
import { pascal } from "../icons/catalog"
import { parseSeq, prettySeq } from "../keys/notation"
import { nodeStyle } from "../render/style"
import { makeNode, nodeLabel } from "../model/tree"
import type { Node } from "../model/types"
import { useEditor } from "../store/useEditor"
import { closeModal } from "./modal"
import { RowLine } from "./RowLine"
import { display, SECTIONS, tokenOf, tokensToProps, nodeProps, isNodeSection } from "./defaultsRows"
import { KEY_SECTIONS, titleOf } from "./keyRows"
import { defaultsView, helpShortcuts, iconsView, ICON_COLUMNS, keysView, loaderView } from "./modalCommands"
import type { NodeDefaultKey } from "../store/slices/defaults"

/* keys go through the global dispatcher; the dialog only shows things (base-ui, via @paladin/shadcn) */
function Shell({ title, description, footer, children, wide }: { title: string, description?: string, footer?: string, children: ReactNode, wide?: boolean }) {
  return (
    <Dialog
      open
      onOpenChange={(open, details) => {
        if (open) return
        // Esc belongs to the modal scopes (it cancels typing or drops a filter before it closes)
        if (details?.reason === "escape-key") return details.cancel?.()
        closeModal()
      }}
    >
      <DialogContent
        className={cn("gap-0 overflow-hidden p-0", wide ? "sm:max-w-3xl" : "sm:max-w-md")}
        {...(!description && { "aria-describedby": undefined })}
      >
        <DialogHeader className="border-b bg-muted/50 px-4 py-3">
          <DialogTitle className="text-xs">{title}</DialogTitle>
          {description && <DialogDescription className="text-[11px]">{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {footer && <footer className="border-t px-4 py-1.5 text-[11px] text-muted-foreground">{footer}</footer>}
      </DialogContent>
    </Dialog>
  )
}

function Sections({ names, current, dim }: { names: string[], current: number, dim?: boolean }) {
  return (
    <nav className="w-40 shrink-0 border-r py-1">
      {names.map((n, i) => (
        <div key={n} className={cn("px-3 py-1 text-sm", i === current && !dim ? "bg-accent text-accent-foreground" : "text-muted-foreground")}>
          {n}
        </div>
      ))}
    </nav>
  )
}

function TypingLine({ prefix, text }: { prefix: string, text: string }) {
  return (
    <div className="flex items-center gap-2 border-t bg-background px-3 py-1.5 font-mono text-sm">
      <span className="text-muted-foreground">{prefix}</span>
      <span>{text}</span>
      <span className="kd-caret" />
    </div>
  )
}

/* live swatch of a node section's defaults */
function Swatch({ props, shape }: { props: Record<string, unknown>, shape?: "ellipse" }) {
  const node: Node = makeNode("frame", { id: "swatch", shape, props })
  const parent: Node = makeNode("frame", { id: "swatch-parent" })
  return (
    <div className="relative h-28 w-48 shrink-0 rounded border bg-background">
      <div style={nodeStyle(node, parent)} />
    </div>
  )
}

function DefaultsModal() {
  const modal = useEditor(s => s.modal)
  const defaults = useEditor(s => s.defaults)
  const doc = useEditor(s => s.doc)
  const rows = defaultsView()
  const sec = SECTIONS[modal.section]
  const board = doc.boards[doc.currentBoard]
  const row = Math.min(modal.row, Math.max(0, rows.length - 1))
  const swatchProps = sec.node ? nodeProps(defaults, sec.id as NodeDefaultKey, board.overrides, modal.scope) : null
  const live = swatchProps && modal.input !== null && !modal.editing ? tokensToProps(swatchProps, modal.input) : swatchProps

  return (
    <Shell
      wide
      title={`Defaults · ${modal.filter ? "all sections" : sec.title} · ${isNodeSection(modal.section) ? (modal.scope === "board" ? `artboard ${board.name}` : "global") : "global"}`}
      description="Changes save immediately"
      footer="←→ section · ↑↓ rows · Space cycle · Alt-↑↓ nudge · Enter edit · i tokens · x reset · / filter · Tab global/artboard · Esc close"
    >
      <div className="flex max-h-[min(28rem,65vh)]">
        <Sections names={SECTIONS.map(s => s.title)} current={modal.section} dim={!!modal.filter} />
        <div className="min-w-0 flex-1 overflow-y-auto py-1">
          {rows.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">{modal.filter ? "No matching rows" : "No defaults set · press i and type tokens"}</p>}
          {rows.map((r, i) => (
            <RowLine
              key={`${r.section}:${r.key}`}
              name={modal.filter ? `${r.sectionTitle} › ${r.label}` : r.label}
              value={
                i === row && modal.editing && modal.input !== null ? (
                  <span>
                    {modal.input}
                    <span className="kd-caret" />
                  </span>
                ) : (
                  display(r, r.value)
                )
              }
              token={tokenOf(r, r.value)}
              active={i === row}
            />
          ))}
        </div>
        {live && (
          <div className="flex shrink-0 flex-col items-center gap-2 border-l p-3">
            <span className="text-[11px] text-muted-foreground">preview</span>
            <Swatch props={live} shape={sec.id === "ellipse" ? "ellipse" : undefined} />
          </div>
        )}
      </div>
      {modal.filter !== null && <TypingLine prefix="/" text={modal.filter} />}
      {modal.input !== null && !modal.editing && <TypingLine prefix="i" text={modal.input} />}
    </Shell>
  )
}

function KeysModal() {
  const modal = useEditor(s => s.modal)
  useEditor(s => s.keymapOverride)
  const rows = keysView()
  const row = Math.min(modal.row, Math.max(0, rows.length - 1))
  return (
    <Shell
      wide
      title={`Keymap · ${KEY_SECTIONS[modal.section]}`}
      description="User changes are stored on top of the defaults"
      footer="←→ mode · ↑↓ rows · i add (keys commandId) · x remove / restore · / filter · Esc close"
    >
      <div className="flex max-h-[min(28rem,65vh)]">
        <Sections names={KEY_SECTIONS} current={modal.section} />
        <div className="min-w-0 flex-1 overflow-y-auto py-1">
          {rows.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No keys in this mode</p>}
          {rows.map((r, i) => (
            <RowLine
              key={`${r.kind}:${r.lhs}`}
              name={<span className={cn(r.source === "removed" && "line-through")}>{r.kind === "alias" ? `alias ${r.lhs}` : r.lhs}</span>}
              value={r.kind === "binding" ? titleOf(r.target) : r.target}
              token={r.source === "default" ? "" : r.source}
              active={i === row}
              muted={r.source === "removed"}
              pending={r.source === "user"}
            />
          ))}
        </div>
      </div>
      {modal.filter !== null && <TypingLine prefix="/" text={modal.filter} />}
      {modal.input !== null && <TypingLine prefix="map" text={modal.input} />}
    </Shell>
  )
}

function outline(nodes: Record<string, Node>, root: string): string[] {
  const lines: string[] = []
  const walk = (id: string, depth: number) => {
    const n = nodes[id]
    if (!n) return
    lines.push(`${"  ".repeat(depth)}${nodeLabel({ nodes } as never, id)}`)
    n.children.forEach(c => walk(c, depth + 1))
  }
  walk(root, 0)
  return lines
}

function LoaderModal() {
  const modal = useEditor(s => s.modal)
  const comps = useEditor(s => s.components)
  const items = loaderView()
  const index = Math.min(modal.index, Math.max(0, items.length - 1))
  const chosen = comps[items[index]]
  return (
    <Shell
      wide
      title={modal.sibling ? "Components · insert as sibling" : "Components · insert as child"}
      footer="type to search · ↑↓ choose · Enter insert · Esc close"
    >
      <TypingLine prefix=">" text={modal.query} />
      <div className="flex max-h-72 border-t">
        <div className="w-56 shrink-0 overflow-y-auto border-r py-1">
          {items.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">{Object.keys(comps).length ? "No match" : "No components yet · :comp save <Name>"}</p>}
          {items.map((n, i) => (
            <RowLine key={n} name={n} value="" active={i === index} />
          ))}
        </div>
        <pre className="min-w-0 flex-1 overflow-auto p-3 font-mono text-xs text-muted-foreground">
          {chosen ? outline(chosen.nodes, chosen.root).join("\n") : ""}
        </pre>
      </div>
    </Shell>
  )
}

function IconsModal() {
  const modal = useEditor(s => s.modal)
  const items = iconsView()
  const index = Math.min(modal.index, Math.max(0, items.length - 1))
  return (
    <Shell title={modal.sibling ? "Icons · insert as sibling" : "Icons"} footer="type to search · arrows move · Enter insert · Esc close">
      <TypingLine prefix=">" text={modal.query} />
      <div className="grid max-h-72 gap-1 overflow-y-auto border-t p-2" style={{ gridTemplateColumns: `repeat(${ICON_COLUMNS}, minmax(0, 1fr))` }}>
        {items.map((n, i) => {
          const Icon = icons[pascal(n) as keyof typeof icons]
          return (
            <div key={n} title={n} className={cn("flex h-10 items-center justify-center rounded", i === index && "bg-accent text-accent-foreground")}>
              {Icon && <Icon size={18} />}
            </div>
          )
        })}
        {items.length === 0 && <p className="col-span-full px-1 py-2 text-xs text-muted-foreground">No match · :icon &lt;name&gt; takes any lucide name</p>}
      </div>
      {items[index] && <div className="border-t px-3 py-1 font-mono text-xs">{items[index]}</div>}
    </Shell>
  )
}

function HelpModal() {
  const override = useEditor(s => s.keymapOverride)
  const items = useMemo<HelpItem[]>(() => {
    const keys = helpShortcuts()
    return COMMANDS.map(c => ({
      group: c.group,
      title: c.title,
      description: c.description,
      shortcut: keys.has(c.id) ? prettySeq(parseSeq(keys.get(c.id)!)) : undefined,
    }))
    // the effective keymap changes with the override
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [override])
  return <HelpPalette items={items} open onOpenChange={open => !open && closeModal()} title="Keydraw commands" description="Shortcuts reflect your keymap" className="sm:max-w-lg" />
}

/* the one open modal (§13–15); keys are handled by the dispatcher in the modal / modal-text scopes */
export function Modals() {
  const kind = useEditor(s => s.modal.kind)
  if (kind === "defaults") return <DefaultsModal />
  if (kind === "keys") return <KeysModal />
  if (kind === "loader") return <LoaderModal />
  if (kind === "icons") return <IconsModal />
  if (kind === "help") return <HelpModal />
  return null
}
