import { cn } from '@bklearn/shadcn';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';

interface PickerInputProps {
  value: string;
  placeholder: string;
  focused: boolean;
  blockCursor?: boolean;
  inputRef: RefObject<HTMLInputElement>;
  /** breadcrumb chips rendered before the caret */
  children?: ReactNode;
  onChange: (v: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
}

export function PickerInput({
  value,
  placeholder,
  focused,
  blockCursor,
  inputRef,
  children,
  onChange,
  onKeyDown,
  onFocus,
  onBlur,
}: PickerInputProps) {
  const shared = {
    ref: inputRef,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    onKeyDown,
    onFocus,
    onBlur,
    spellCheck: false,
    autoComplete: 'off' as const,
  };

  if (!blockCursor) {
    return (
      <div className="flex flex-1 flex-wrap items-center gap-1.5">
        {children}
        <input
          {...shared}
          placeholder={placeholder}
          className={cn(
            'min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm outline-none',
            'text-picker-fg caret-picker-caret placeholder:text-picker-placeholder',
          )}
        />
      </div>
    );
  }

  // Block caret: hide the native caret and paint a steady block after the text.
  // The list captures arrow keys, so the caret always sits at the end.
  return (
    <div className="flex flex-1 flex-wrap items-center gap-1.5">
      {children}
      <div className="relative min-w-[8rem] flex-1">
        <div aria-hidden className="pointer-events-none flex items-center py-0.5 text-sm">
          {value ? (
            <span className="whitespace-pre text-picker-fg">{value}</span>
          ) : (
            <span className="text-picker-placeholder">{placeholder}</span>
          )}
          {focused && (
            <span className="ml-px inline-block h-[1.15em] w-[0.5em] translate-y-[0.1em] bg-picker-caret" />
          )}
        </div>
        <input
          {...shared}
          className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none"
        />
      </div>
    </div>
  );
}
