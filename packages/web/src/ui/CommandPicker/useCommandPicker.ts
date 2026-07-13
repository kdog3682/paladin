import { useMemo, useState, type KeyboardEvent } from 'react';
import { filterNodes } from './fuzzy';
import type { PickerNode, PickerStep, PickerProps, ExitReason } from './types';

export function useCommandPicker(props: PickerProps) {
  const { commands, quickPick = true, onEnter, onExit, onRun } = props;

  const [chips, setChips] = useState<PickerStep[]>([]);
  const [mode, setMode] = useState<'pick' | 'input'>('pick');
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const [focused, setFocused] = useState(false);
  const [flash, setFlash] = useState(false);

  const kidsOf = (node: PickerNode | null, steps: PickerStep[]): PickerNode[] => {
    if (!node) return commands;
    const c = typeof node.children === 'function' ? node.children({ steps }) : node.children;
    return c ?? [];
  };

  const container = chips.length ? chips[chips.length - 1].node : null;
  const raw = mode === 'input' ? [] : kidsOf(container, chips);
  const choices = useMemo(() => (mode === 'input' ? [] : filterNodes(query, raw)), [mode, query, raw]);
  const cur = Math.min(hi, Math.max(0, choices.length - 1));
  const inputNode = mode === 'input' ? chips[chips.length - 1]?.node ?? null : null;

  const doFlash = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 220);
  };

  const exit = (reason: ExitReason) => {
    setChips([]);
    setMode('pick');
    setQuery('');
    setHi(0);
    onExit?.(reason);
  };

  const settle = (node: PickerNode, chipsNow: PickerStep[], prefill?: string | void) => {
    const kids = kidsOf(node, chipsNow);
    if (kids.length) {
      setChips(chipsNow);
      setMode('pick');
      setHi(0);
      setQuery(typeof prefill === 'string' ? prefill : '');
    } else if (node.run) {
      node.run({ steps: chipsNow });
      onRun?.({ steps: chipsNow });
      exit('run');
    } else {
      exit('run');
    }
  };

  const enterNode = (node: PickerNode) => {
    const chipsNow: PickerStep[] = [...chips, { node, input: undefined }];
    const prefill = onEnter?.({ node, steps: chipsNow, awaitingInput: !!node.input });
    if (node.input) {
      setChips(chipsNow);
      setMode('input');
      setHi(0);
      setQuery(typeof prefill === 'string' ? prefill : '');
      return;
    }
    settle(node, chipsNow, prefill);
  };

  const submitInput = () => {
    if (!inputNode?.input) return;
    const cfg = inputNode.input;
    if (query.trim() === '' && !cfg.optional) return doFlash();
    const val = query.trim() === '' ? (cfg.optional ? null : query) : query;
    const chipsNow = chips.map((c, i) => (i === chips.length - 1 ? { ...c, input: val } : c));
    setMode('pick');
    settle(inputNode, chipsNow);
  };

  const popChip = () => {
    if (!chips.length) return;
    setChips((c) => c.slice(0, -1));
    setMode('pick');
    setQuery('');
    setHi(0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const k = e.key;
    if (k === 'Tab') {
      e.preventDefault();
      if (choices.length) setHi((h) => (h + (e.shiftKey ? -1 : 1) + choices.length) % choices.length);
      return;
    }
    if (k === 'ArrowDown') {
      e.preventDefault();
      if (choices.length) setHi((h) => (h + 1) % choices.length);
      return;
    }
    if (k === 'ArrowUp') {
      e.preventDefault();
      if (choices.length) setHi((h) => (h - 1 + choices.length) % choices.length);
      return;
    }
    if (k === 'Enter') {
      e.preventDefault();
      if (mode === 'input') submitInput();
      else if (choices[cur]) enterNode(choices[cur]);
      return;
    }
    if (k === 'Escape') {
      e.preventDefault();
      if (chips.length) popChip();
      else if (query) setQuery('');
      else exit('escape');
      return;
    }
    if (k === 'Backspace' && query === '') {
      e.preventDefault();
      if (chips.length) popChip();
      return;
    }
    if (quickPick && mode === 'pick' && query === '' && /^[1-9]$/.test(k)) {
      const idx = Number(k) - 1;
      if (choices[idx]) {
        e.preventDefault();
        enterNode(choices[idx]);
      }
    }
  };

  const onFocus = () => setFocused(true);
  const onBlur = () => {
    setFocused(false);
    onExit?.('blur');
  };

  return {
    chips,
    mode,
    query,
    choices,
    cur,
    focused,
    inputNode,
    flash,
    setQuery,
    setHi,
    setFocused,
    enterNode,
    handlers: { onKeyDown, onFocus, onBlur },
  };
}
