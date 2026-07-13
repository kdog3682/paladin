import { cn } from '@bklearn/shadcn';
import { Check, ChevronRight } from 'lucide-react';
import { Keycap } from './Keycap';
import type { PickerNode } from './types';

interface OptionRowProps {
  node: PickerNode;
  index: number;
  active: boolean;
  showQuickPick: boolean;
  descriptionLayout: 'inline' | 'below';
  onHover: () => void;
  onSelect: () => void;
}

export function OptionRow({
  node,
  index,
  active,
  showQuickPick,
  descriptionLayout,
  onHover,
  onSelect,
}: OptionRowProps) {
  const Icon = node.icon;
  const branches = !!node.children;

  const label = (
    <span className={cn('truncate text-sm', active ? 'text-picker-option-active-fg' : 'text-picker-fg')}>
      {node.label}
    </span>
  );

  return (
    <li>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()} // keep the input focused
        onMouseEnter={onHover}
        onClick={onSelect}
        className={cn(
          'group flex w-full items-center gap-3 px-3 py-2 text-left',
          active ? 'bg-picker-option-active' : 'hover:bg-picker-option-hover',
        )}
      >
        <span
          className={cn('h-6 w-[3px] shrink-0 rounded-full', active ? 'bg-picker-accent' : 'bg-transparent')}
        />
        {Icon && (
          <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-picker-accent' : 'text-picker-muted')} />
        )}

        {descriptionLayout === 'below' ? (
          <span className="flex min-w-0 flex-col">
            {label}
            {node.description && (
              <span className="truncate text-xs text-picker-subtle">{node.description}</span>
            )}
          </span>
        ) : (
          label
        )}

        <span className="ml-auto flex items-center gap-3 pl-3">
          {descriptionLayout === 'inline' && node.description && (
            <span className="truncate text-xs text-picker-subtle">{node.description}</span>
          )}
          {node.input && (
            <span className="rounded bg-picker-keycap px-1 font-mono text-[10px] text-picker-muted">input</span>
          )}
          <span className="flex shrink-0 items-center gap-2">
            {showQuickPick && <Keycap>{index + 1}</Keycap>}
            {branches ? (
              <ChevronRight
                className={cn('h-3.5 w-3.5', active ? 'text-picker-accent' : 'text-picker-muted')}
              />
            ) : (
              active && <Check className="h-3.5 w-3.5 text-picker-accent" />
            )}
          </span>
        </span>
      </button>
    </li>
  );
}
