import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CommandDef, CommandSchema } from './types';

function rank(query: string, target: string) {
  return target.toLowerCase().indexOf(query.toLowerCase());
}

function filterSort(query: string, items: string[]) {
  if (!query) return items;
  return items
    .map((item, i) => ({ item, i, rank: rank(query, item) }))
    .filter((x) => x.rank !== -1)
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.item);
}

interface UseCommandPaletteOptions<TContext> {
  schema: CommandSchema<TContext>;
  ctx: TContext;
  /** called after a command's run() resolves and the sequence is finished */
  onDone?: () => void;
}

export function useCommandPalette<TContext>({
  schema,
  ctx,
  onDone,
}: UseCommandPaletteOptions<TContext>) {
  const [query, setQuery] = useState('');
  const [activeCommand, setActiveCommand] = useState<CommandDef<TContext> | null>(null);
  const [argIndex, setArgIndex] = useState(0);
  const [collectedArgs, setCollectedArgs] = useState<string[]>([]);
  const [options, setOptions] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const isCollectingArgs = activeCommand !== null;
  const currentArg = isCollectingArgs ? (activeCommand!.args?.[argIndex] ?? null) : null;
  const isFreeInput = isCollectingArgs && (!currentArg?.options || currentArg.type === 'input');

  const reset = useCallback(() => {
    setQuery('');
    setActiveCommand(null);
    setArgIndex(0);
    setCollectedArgs([]);
    setOptions(null);
    setLoading(false);
    setHighlighted(0);
  }, []);

  // resolve options whenever a new arg step is entered
  useEffect(() => {
    if (!isCollectingArgs || !currentArg) return;
    if (!currentArg.options) {
      setOptions(null);
      return;
    }
    if (Array.isArray(currentArg.options)) {
      setOptions(currentArg.options);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.resolve(currentArg.options(ctx, collectedArgs))
      .then((result) => {
        if (!cancelled) setOptions(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // only re-resolve when we move to a different command/arg step
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCommand, argIndex]);

  const commandItems = useMemo(
    () => filterSort(query, schema.map((c) => c.key)),
    [query, schema],
  );

  const argItems = useMemo(() => (options ? filterSort(query, options) : []), [query, options]);

  const items = isCollectingArgs ? argItems : commandItems;

  useEffect(() => {
    setHighlighted(0);
  }, [items.length, query]);

  const advanceArg = useCallback(
    async (value: string) => {
      if (!activeCommand) return;
      const nextArgs = [...collectedArgs, value];
      const total = activeCommand.args?.length ?? 0;
      if (argIndex + 1 < total) {
        setCollectedArgs(nextArgs);
        setArgIndex((i) => i + 1);
        setQuery('');
      } else {
        await activeCommand.run(ctx, ...nextArgs);
        reset();
        onDone?.();
      }
    },
    [activeCommand, argIndex, collectedArgs, ctx, reset, onDone],
  );

  const selectCommand = useCallback(
    async (key: string) => {
      const cmd = schema.find((c) => c.key === key);
      if (!cmd) return;
      if (!cmd.args || cmd.args.length === 0) {
        await cmd.run(ctx);
        reset();
        onDone?.();
        return;
      }
      setActiveCommand(cmd);
      setArgIndex(0);
      setCollectedArgs([]);
      setQuery('');
    },
    [schema, ctx, reset, onDone],
  );

  const confirm = useCallback(() => {
    if (isCollectingArgs) {
      if (isFreeInput) {
        if (query.trim()) advanceArg(query.trim());
        return;
      }
      const value = items[highlighted];
      if (value !== undefined) advanceArg(value);
      return;
    }
    const key = items[highlighted];
    if (key !== undefined) selectCommand(key);
  }, [isCollectingArgs, isFreeInput, query, items, highlighted, advanceArg, selectCommand]);

  const move = useCallback((delta: number) => {
    setHighlighted((h) => {
      const len = items.length || 1;
      return (h + delta + len) % len;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  return {
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
  };
}
