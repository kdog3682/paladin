import { OptionRow } from './OptionRow';
import type { PickerNode } from './types';

interface OptionListProps {
  choices: PickerNode[];
  cur: number;
  query: string;
  quickPick: boolean;
  descriptionLayout: 'inline' | 'below';
  onHover: (i: number) => void;
  onSelect: (n: PickerNode) => void;
}

export function OptionList({
  choices,
  cur,
  query,
  quickPick,
  descriptionLayout,
  onHover,
  onSelect,
}: OptionListProps) {
  if (!choices.length) {
    return <div className="px-4 py-6 text-sm text-picker-muted">No matches.</div>;
  }
  return (
    <ul className="max-h-80 overflow-y-auto py-1.5">
      {choices.map((n, i) => (
        <OptionRow
          key={n.id}
          node={n}
          index={i}
          active={i === cur}
          showQuickPick={quickPick && query === '' && i < 9}
          descriptionLayout={descriptionLayout}
          onHover={() => onHover(i)}
          onSelect={() => onSelect(n)}
        />
      ))}
    </ul>
  );
}
