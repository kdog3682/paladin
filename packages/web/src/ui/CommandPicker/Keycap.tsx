import { cn } from '@bklearn/shadcn';
import type { ReactNode } from 'react';

export function Keycap({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-[5px] px-1',
        'border border-picker-keycap-border bg-picker-keycap',
        'font-mono text-[10px] font-medium text-picker-keycap-fg',
        wide && 'px-1.5',
      )}
    >
      {children}
    </kbd>
  );
}
