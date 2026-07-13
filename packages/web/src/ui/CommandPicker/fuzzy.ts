import type { PickerNode } from './types';

/** subsequence match; returns index of first hit (lower = better) or null */
export function match(q: string, node: PickerNode): number | null {
  if (!q) return 0;
  const hay = [node.label, node.description, ...(node.keywords ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const needle = q.toLowerCase();
  let ti = 0;
  let first = -1;
  for (const c of needle) {
    const idx = hay.indexOf(c, ti);
    if (idx < 0) return null;
    if (first < 0) first = idx;
    ti = idx + 1;
  }
  return first;
}

export function filterNodes(q: string, nodes: PickerNode[]): PickerNode[] {
  return nodes
    .map((n) => ({ n, s: match(q, n) }))
    .filter((x): x is { n: PickerNode; s: number } => x.s !== null)
    .sort((a, b) => a.s - b.s || a.n.label.length - b.n.label.length)
    .map((x) => x.n);
}
