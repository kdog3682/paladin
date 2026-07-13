import { cn } from '@bklearn/shadcn';
import type { PickerStep } from './types';

export function Chip({ step }: { step: PickerStep }) {
  const { node } = step;
  const Icon = node.icon;
  const showValue = step.input != null && step.input !== '';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium',
        'bg-picker-chip text-picker-chip-fg ring-1 ring-inset ring-picker-chip-ring',
      )}
    >
      {node.chip ? (
        node.chip(step)
      ) : (
        <>
          {Icon && <Icon className="h-3 w-3" />}
          {node.label}
        </>
      )}
      {showValue && (
        <span className="ml-0.5 max-w-[10rem] truncate rounded bg-picker-chip-value px-1 text-picker-chip-value-fg">
          {step.input}
        </span>
      )}
    </span>
  );
}
