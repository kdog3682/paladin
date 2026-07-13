interface ABCLayoutProps {
  bgColor?: string
  width?: string
  height?: string
  padding?: string
  children: [React.ReactNode, React.ReactNode, React.ReactNode]
}

function Placeholder() {
  return <div style={{ height: '100%', width: '100%', backgroundColor: '#e5e5e5' }} />
}

export function ABCLayout({
  bgColor = 'white',
  width = '100%',
  height = '100%',
  padding = '5px',
  children
}: ABCLayoutProps) {
  const [a, b, c] = children

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
          gridTemplateColumns: '7fr 3fr',
          gridTemplateRows: '1fr 15px',
          gridTemplateAreas: '"a b" "c b"',
          gap: padding,
          height: '100%',
          width: '100%'
        }}
      >
        <div style={{ gridArea: 'a' }}>{a ?? <Placeholder />}</div>
        <div style={{ gridArea: 'b' }}>{b ?? <Placeholder />}</div>
        <div style={{ gridArea: 'c' }}>{c ?? <Placeholder />}</div>
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
    <ABCLayout bgColor="#facc15" width="300pt" height="200pt" padding="5pt">
      <Cell color="#ef4444" label="A" />
      <Cell color="#3b82f6" label="B" />
      <Cell color="#14b8a6" label="C" />
    </ABCLayout>
  )
}
