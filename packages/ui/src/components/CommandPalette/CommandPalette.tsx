'use client';

import { useEffect, useRef } from 'react';
import { cn, Dialog, DialogContent } from '@bklearn/shadcn';
import { useCommandPalette } from './useCommandPalette';
import type { CommandSchema } from './types';

interface CommandPaletteProps<TContext> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schema: CommandSchema<TContext>;
  ctx: TContext;
}

export function CommandPalette<TContext>({
  open,
  onOpenChange,
  schema,
  ctx,
}: CommandPaletteProps<TContext>) {
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    query,
    setQuery,
    items,
    highlighted,
    setHighlighted,
    move,
    confirm,
    reset,
    isCollectingArgs,
    isFreeInput,
    loading,
    activeCommand,
    argIndex,
  } = useCommandPalette({
    schema,
    ctx,
    onDone: () => onOpenChange(false),
  });

  useEffect(() => {
    if (open) {
      reset();
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      confirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  const breadcrumb = activeCommand
    ? `${activeCommand.key} · arg ${argIndex + 1}/${activeCommand.args?.length ?? 0}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        {breadcrumb && (
          <div className="px-3 pt-2 text-xs text-muted-foreground">{breadcrumb}</div>
        )}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isCollectingArgs ? 'Type a value…' : 'Type a command…'}
          className="w-full border-b bg-transparent px-3 py-3 text-sm outline-none"
        />
        <div className="max-h-72 overflow-y-auto p-1">
          {loading && <div className="px-2 py-4 text-sm text-muted-foreground">Loading…</div>}

          {!loading && !isFreeInput && items.length === 0 && (
            <div className="px-2 py-4 text-sm text-muted-foreground">No matches</div>
          )}

          {!loading &&
            !isFreeInput &&
            items.map((item, i) => {
              const cmd = !isCollectingArgs ? schema.find((c) => c.key === item) : undefined;
              return (
                <div
                  key={item}
                  onMouseEnter={() => setHighlighted(i)}
                  onClick={() => {
                    setHighlighted(i);
                    confirm();
                  }}
                  className={cn(
                    'flex cursor-pointer items-center justify-between rounded-md px-2 py-2 text-sm',
                    i === highlighted && 'bg-accent text-accent-foreground',
                  )}
                >
                  <span>{item}</span>
                  {cmd?.desc && <span className="text-xs text-muted-foreground">{cmd.desc}</span>}
                </div>
              );
            })}

          {!loading && isFreeInput && (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              Press Enter to use "{query}"
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
