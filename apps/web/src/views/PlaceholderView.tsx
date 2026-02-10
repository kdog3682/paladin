// @paladin/web/src/views/PlaceholderView.tsx

import { Construction } from "lucide-react"

interface PlaceholderViewProps {
  name: string
}

export function PlaceholderView({ name }: PlaceholderViewProps) {
  return (
    <div className="flex-1 flex items-center justify-center text-muted-foreground">
      <div className="text-center">
        <Construction className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">{name}</p>
        <p className="text-sm mt-1">Coming soon</p>
      </div>
    </div>
  )
}
