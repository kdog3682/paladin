interface SidePanelABProps {
  bgColor?: string
  width?: string
  height?: string
  padding?: string
  dividerColor?: string
  dividerThickness?: string
  children: [React.ReactNode, React.ReactNode]
}

function Placeholder() {
  return <div style={{ height: '100%', width: '100%', backgroundColor: '#e5e5e5' }} />
}

export function SidePanelAB({
  bgColor = 'white',
  width = '100%',
  height = '100%',
  padding = '5px',
  dividerColor = 'black',
  dividerThickness = '0.5px',
  children
}: SidePanelABProps) {
  const [a, b] = children
  return (
    <div
      style={{
        backgroundColor: bgColor,
        width,
        height,
        padding,
        boxSizing: 'border-box'
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateRows: `30% ${dividerThickness} 1fr`,
          gap: padding,
          height: '100%',
          width: '100%'
        }}
      >
        <div style={{ minHeight: 0 }}>{a ?? <Placeholder />}</div>
        <div style={{ backgroundColor: dividerColor, width: '100%' }} />
        <div style={{ minHeight: 0 }}>{b ?? <Placeholder />}</div>
      </div>
    </div>
  )
}

function Cell({ color, label }: { color: string, label: string }) {
  return (
    <div
      className="flex items-center justify-center text-2xl font-bold text-white"
      style={{ backgroundColor: color, height: '100%', width: '100%' }}
    >
      {label}
    </div>
  )
}

export default function Demo() {
  return (
    <SidePanelAB bgColor="#facc15" width="300pt" height="200pt" padding="5pt">
      <Cell color="#ef4444" label="A" />
      <Cell color="#3b82f6" label="B" />
    </SidePanelAB>
  )
}
