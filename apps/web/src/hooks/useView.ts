// @paladin/web/src/hooks/useView.ts

import { useEffect } from "react"
import { useStore } from "@/stores/app"

export type ViewId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export function useView() {
  const setView = useStore((s) => s.setView)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return

      const num = parseInt(e.key, 10)
      if (num >= 1 && num <= 9) {
        setView(num as ViewId)
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [setView])
}
