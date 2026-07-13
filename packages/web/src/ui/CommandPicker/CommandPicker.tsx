import { Fragment, useRef } from 'react';
import { cn } from '@bklearn/shadcn';
import { ChevronRight, CornerDownLeft, Search } from 'lucide-react';
import { useCommandPicker } from './useCommandPicker';
import { PickerInput } from './PickerInput';
import { OptionList } from './OptionList';
import { Chip } from './Chip';
import { Keycap } from './Keycap';
import type { PickerProps } from './types';

export function CommandPicker(props: PickerProps) {
  const {
    placement = 'below',
    descriptionLayout = 'inline',
    blockCursor = false,
    quickPick = true,
    className,
  } = props;

  const inputRef = useRef<HTMLInputElement>(null);
  const pk = useCommandPicker(props);
  const { chips, mode, query, choices, cur, focused, inputNode, flash } = pk;

  const placeholder =
    props.placeholder ??
    (mode === 'input'
      ? inputNode?.input?.placeholder ?? 'Type a value…'
      : chips.length
        ? 'Continue…'
        : 'Type a command…');

  const chipEls = (
    <>
      <Search className="h-4 w-4 shrink-0 text-picker-muted" />
      {chips.map((c, i) => (
        <Fragment key={i}>
          <Chip step={c} />
          {(i < chips.length - 1 || mode !== 'input') && (
            <ChevronRight className="mx-0.5 h-3 w-3 shrink-0 text-picker-muted" />
          )}
        </Fragment>
      ))}
    </>
  );

  const inputRow = (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1.5 px-3 py-2.5',
        placement === 'below' ? 'border-b border-picker-border' : 'border-t border-picker-border',
      )}
    >
      <PickerInput
        inputRef={inputRef}
        value={query}
        focused={focused}
        blockCursor={blockCursor}
        placeholder={placeholder}
        onChange={(v) => {
          pk.setQuery(v);
          pk.setHi(0);
        }}
        onKeyDown={pk.handlers.onKeyDown}
        onFocus={pk.handlers.onFocus}
        onBlur={pk.handlers.onBlur}
      >
        {chipEls}
      </PickerInput>
    </div>
  );

  // The listing only appears while the input is focused.
  const body = !focused ? null : mode === 'input' ? (
    <div className="flex items-center gap-2 px-4 py-6 text-sm text-picker-muted">
      <CornerDownLeft className="h-4 w-4 text-picker-accent" />
      Press <Keycap wide>Enter</Keycap> to run
      {inputNode?.input?.optional && <span className="text-picker-subtle">· optional</span>}
    </div>
  ) : (
    <OptionList
      choices={choices}
      cur={cur}
      query={query}
      quickPick={quickPick}
      descriptionLayout={descriptionLayout}
      onHover={pk.setHi}
      onSelect={pk.enterNode}
    />
  );

  const footer = focused ? (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 font-mono text-[10px] text-picker-muted',
        placement === 'below' ? 'border-t border-picker-border' : 'border-b border-picker-border',
      )}
    >
      <span className="flex items-center gap-1">
        <Keycap>Tab</Keycap>
        <Keycap wide>⇧Tab</Keycap> cycle
      </span>
      {quickPick && (
        <span className="flex items-center gap-1">
          <Keycap>1</Keycap>–<Keycap>9</Keycap> pick
        </span>
      )}
      <span className="flex items-center gap-1">
        <Keycap wide>Enter</Keycap> select
      </span>
      <span className="flex items-center gap-1">
        <Keycap wide>⌫</Keycap> chip
      </span>
    </div>
  ) : null;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-picker-border bg-picker text-picker-fg',
        'ring-1 ring-inset ring-picker-ring',
        flash && 'animate-picker-shake',
        className,
      )}
    >
      {placement === 'below' ? (
        <>
          {inputRow}
          {body}
          {footer}
        </>
      ) : (
        <>
          {footer}
          {body}
          {inputRow}
        </>
      )}
    </div>
  );
}
