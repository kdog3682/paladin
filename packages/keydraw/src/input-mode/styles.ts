/*
 * Named styles (`:style save <name>`) usable as tokens. The store keeps them in sync
 * (see store/slices/styles.ts); tokenize() expands them so every typing line shares the behavior.
 */
let named: Record<string, string> = {}

export function setNamedStyles(styles: Record<string, string>): void {
  named = styles
}

export function namedStyle(word: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(named, word) ? named[word] : undefined
}

export function styleNames(): string[] {
  return Object.keys(named)
}
