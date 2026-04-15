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
  side?: 'left' | 'right' | 'top' | 'bottom'
  className?: string
}

export function IconButton({
  icon,
  label,
  onClick,
  active = false,
  size = 'md',
  side = 'bottom',
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
        <TooltipContent
          side={side}
          sideOffset={6}
          className="z-[100] bg-neutral-900 text-white text-xs px-2 py-1 rounded-full border-0 shadow-none"
          arrow={false}
        >
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
