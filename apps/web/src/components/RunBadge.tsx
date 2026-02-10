// @paladin/web/src/components/RunBadge.tsx

import type { RunResult } from "@paladin/types"

interface RunBadgeProps {
  result: RunResult
}

export function RunBadge({ result }: RunBadgeProps) {
  const { passed, total } = result.summary
  const allPassed = passed === total && total > 0

  return (
    <span
      className={`
        px-1.5 py-0.5 text-xs font-mono rounded shrink-0
        ${allPassed ? "bg-emerald-900/50 text-emerald-400" : "bg-rose-900/50 text-rose-400"}
      `}
    >
      {passed}/{total}
    </span>
  )
}
