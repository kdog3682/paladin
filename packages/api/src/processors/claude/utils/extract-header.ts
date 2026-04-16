const COMMENT_PATTERNS = [
  /^\/\/\s*(.+)/,
  /^#(?!!)(?:#*)\s+(.+)/,
  /^<!--\s*(.+?)\s*-->/,
];

const SKIP_ACTIONS = new Set([
  "delete",
  "deleted",
  "deprecate",
  "deprecated",
]);

export function extractHeader(content: string): string | null {
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#!")) continue;

    for (const pattern of COMMENT_PATTERNS) {
      const m = trimmed.match(pattern);
      if (!m) continue;
      return parseHeaderComment(m[1]);
    }

    return null;
  }

  return null;
}

function parseHeaderComment(raw: string): string | null {
  const match = raw.trim().match(/^(\S+)/);
  if (!match) return null;

  const token = match[1];
  if (!token.includes("/") && !token.includes(".")) return null;

  const rest = raw.trim().slice(token.length).trim();
  if (rest && SKIP_ACTIONS.has(rest.toLowerCase())) return null;

  return token;
}
