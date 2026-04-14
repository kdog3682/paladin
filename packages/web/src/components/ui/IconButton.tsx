// src/components/ui/IconButton.tsx

import { type ReactNode } from 'react'
import { cn } from '@bklearn/shadcn'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@bklearn/shadcn'

interface IconButtonProps {
  icon: ReactNode
  label: string
  onClick?: () => void
  active?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export function IconButton({
  icon,
  label,
  onClick,
  active = false,
  size = 'md',
  className,
}: IconButtonProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              'flex items-center justify-center rounded transition-colors',
              size === 'sm' ? 'h-7 w-7' : 'h-8 w-8',
              active
                ? 'bg-neutral-200 text-neutral-900'
                : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100',
              className,
            )}
          >
            {icon}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
