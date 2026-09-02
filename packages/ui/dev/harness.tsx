import type { ReactNode } from "react"

// Minimal layout primitives so the catalog files stay readable.
// Deliberately unstyled-ish: this chrome should never be mistaken
// for the components under test.

export function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section style={{ marginBottom: 48 }}>
      <h2
        style={{
          font: "600 13px/1 ui-monospace, monospace",
          textTransform: "uppercase",
          letterSpacing: ".08em",
          color: "#6b7280",
          borderBottom: "1px solid #e5e7eb",
          paddingBottom: 8,
          marginBottom: 20,
        }}
      >
        {title}
      </h2>
      <div style={{ display: "grid", gap: 20 }}>{children}</div>
    </section>
  )
}

// One labelled state of a component. The label is what makes the page
// scannable — you want to see "disabled + loading" without inferring it.
export function Specimen({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ font: "400 11px/1 ui-monospace, monospace", color: "#9ca3af" }}>
        {label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        {children}
      </div>
    </div>
  )
}

// Wraps a specimen in a constrained box to catch overflow and wrapping bugs.
export function Constrained({
  width,
  children,
}: {
  width: number
  children: ReactNode
}) {
  return (
    <div style={{ width, outline: "1px dashed #d1d5db", padding: 8 }}>{children}</div>
  )
}
