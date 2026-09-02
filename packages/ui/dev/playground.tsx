import { useState } from "react"
// Self-referencing import: resolves through the package's own "exports" map
// to src/index.ts. Using this instead of "../src/button" means a component
// missing from the barrel breaks here, not in a consuming app.
import { Button } from "@paladin/ui"
import { Section, Specimen, Constrained } from "./harness"

const BACKGROUNDS = ["#ffffff", "#f3f4f6", "#111827"] as const

export function Playground() {
  const [bg, setBg] = useState<string>(BACKGROUNDS[0])
  const [rtl, setRtl] = useState(false)

  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      style={{
        minHeight: "100vh",
        background: bg,
        color: bg === "#111827" ? "#f9fafb" : "#111827",
        font: "400 14px/1.5 system-ui, sans-serif",
        padding: 32,
      }}
    >
      <Toolbar bg={bg} onBg={setBg} rtl={rtl} onRtl={setRtl} />

      <Section title="Button / variants">
        <Specimen label="primary">
          <Button variant="primary">Save changes</Button>
        </Specimen>
        <Specimen label="secondary">
          <Button variant="secondary">Cancel</Button>
        </Specimen>
        <Specimen label="danger">
          <Button variant="danger">Delete account</Button>
        </Specimen>
      </Section>

      <Section title="Button / states">
        <Specimen label="disabled">
          <Button disabled>Save changes</Button>
        </Specimen>
        <Specimen label="loading">
          <Button loading>Save changes</Button>
        </Specimen>
        <Specimen label="disabled + loading">
          <Button disabled loading>
            Save changes
          </Button>
        </Specimen>
      </Section>

      {/* The states a real app rarely shows you until a customer finds them. */}
      <Section title="Button / edge cases">
        <Specimen label="long label, unconstrained">
          <Button>
            Acknowledge and permanently archive all seventeen selected records
          </Button>
        </Specimen>
        <Specimen label="long label in a 200px container">
          <Constrained width={200}>
            <Button>Acknowledge and permanently archive</Button>
          </Constrained>
        </Specimen>
        <Specimen label="empty label">
          <Button>{""}</Button>
        </Specimen>
        <Specimen label="many in a row (wrapping)">
          {Array.from({ length: 8 }, (_, i) => (
            <Button key={i}>Item {i + 1}</Button>
          ))}
        </Specimen>
      </Section>
    </div>
  )
}

function Toolbar({
  bg,
  onBg,
  rtl,
  onRtl,
}: {
  bg: string
  onBg: (v: string) => void
  rtl: boolean
  onRtl: (v: boolean) => void
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        marginBottom: 40,
        font: "400 12px/1 ui-monospace, monospace",
      }}
    >
      {BACKGROUNDS.map((c) => (
        <button
          key={c}
          onClick={() => onBg(c)}
          aria-label={`background ${c}`}
          style={{
            width: 24,
            height: 24,
            background: c,
            border: c === bg ? "2px solid #3b82f6" : "1px solid #9ca3af",
            borderRadius: 4,
            cursor: "pointer",
          }}
        />
      ))}
      <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
        <input type="checkbox" checked={rtl} onChange={(e) => onRtl(e.target.checked)} />
        rtl
      </label>
    </div>
  )
}
