/* The instructions handed to whoever writes the comments, carrying the nonce their answer has to repeat. */
export function renderPrompt(nonce: string): string {
  return `# Comment audit

You're writing the doc comments for the public API of a TypeScript library. Every declaration in that API is printed below, grouped by file, the way the generated docs will show it: the signature, with its comment above it.

Entries that need a comment carry a number:

- \`[n] ✗ missing\`: there's no comment yet. Write one.
- \`[n] ✎ long\`: the comment under the label is too long. Write a shorter one that keeps what a caller needs.

Comments without a number are fine as they are. Numbered functions show their body so you can see what they do. Everywhere else a body is shown as \`{ … }\`.

## What a comment says

- The docs print the signature next to the comment. Don't repeat names, types, optionality, defaults, or anything the return type already says.
- Say what it does for the caller: what it returns or changes, when it throws, and the edge cases a caller could trip over.
- Leave out how it works inside: helper functions, algorithms, caching, variable names from the body.
- A declaration gets one or two sentences, three at most.
- A field, method or enum member gets a short phrase in lowercase with no final period, like the field comments already there.
- Match the tone of the existing comments. Put code in \`backticks\`.

## What to send back

A single plain-text file named \`commentAudit.txt\`. Not JSON, and no code fence around it. The first line is the nonce, then one block per number:

\`\`\`
nonce ${nonce}

@@ 3
the file that now provides the export

@@ 9
Reads the named re-exports of a barrel file into a map from exported
name to target. \`export *\` is not expanded.
\`\`\`

- \`@@ n\` goes on its own line, and the comment follows on the lines after it.
- Write only the comment text: no \`/*\`, no leading \`*\`.
- Never copy a signature or any other code back.
- If there's nothing useful to say for a number, leave it out and it stays as it is.`
}
