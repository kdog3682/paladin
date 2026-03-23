// @paladin/json-viewer-frontend/src/components/JsonKey.tsx

import { useStore } from "../store"

interface JsonKeyProps {
  name: string
}

export function JsonKey({ name }: JsonKeyProps) {
  const t = useStore((s) => s.theme)

  return (
    <span className={t.key}>
      "{name}"
      <span className={t.comma}>: </span>
    </span>
  )
}
