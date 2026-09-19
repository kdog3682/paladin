# exemplar: cyclic-structure crash from a package missing `src/index.ts`

**Where:** `mathpen/packages/workbook`, running `worksheet.examples.ts` through `exemplar`.

## Symptom

```
TypeError: JSON.stringify cannot serialize cyclic structures.
    at stringify (unknown)
    at runItem (packages/exemplar/src/base.ts:135:26)
    at async runFile (packages/exemplar/src/base.ts:160:48)
    at async runExampleFiles (packages/exemplar/src/runFiles.ts:27:46)
```

## Cause

`resolveHooks` (`packages/exemplar/src/base.ts`) picks a `serialize` hook in this order: an explicit
`Spec` override, then `fallback.serialize` where `fallback` is whatever `importNamespace(namespace, root)`
resolves — first `import(namespace)` (the bare package specifier), falling back to `import(root/src/index.ts)`
— then `defaultSerialize` (plain `JSON.stringify`).

`@mathpen/workbook`'s `package.json` declares `"main": "src/index.ts"`, but that file didn't exist. Both
import attempts in `importNamespace` failed and were swallowed (`.catch(() => ({}))`), so `fallback` was `{}`
and hook resolution silently fell through to `defaultSerialize`. `worksheetExample()` returns a tree of
`@mathpen/manim` `VMobject`s, which have internal cycles — plain `JSON.stringify` can't handle that, and
`@mathpen/manim` ships its own cycle-free serializer (`toJSON`/`fromJSON` in `src/render/serialize.ts`,
re-exported as `serialize`/`deserialize`) for exactly this reason.

The failure mode gives no signal that the hook lookup failed — a missing/broken namespace module and a
package that genuinely has no serialize hook look identical from `runItem`'s perspective.

## Fix

Added `mathpen/packages/workbook/src/index.ts`, re-exporting `Worksheet` plus manim's `serialize` /
`deserialize` / `display`, so `resolveHooks`'s `fallback` import succeeds and finds them.

Exported the manim hooks by relative path (`../../manim/src/render/serialize`, `../../manim/src/display`)
rather than `from "@mathpen/manim"`. A static `export {...} from "@mathpen/manim"` resolved through the
package's `browser` condition in `package.json#exports` (which doesn't export `serialize`/`deserialize`),
while a dynamic `import("@mathpen/manim")` of the same specifier resolved through `node` (which does) —
Bun picked different conditions for the two forms of the same specifier. Worth checking for elsewhere if a
package re-exports through a conditional-exports dependency and reports a missing export that a plain
dynamic import can see fine.

## Follow-up convention

Any future `mathpen/packages/*` package whose examples return `@mathpen/manim` mobjects needs the same
`serialize`/`display` re-export in its own `src/index.ts` — this is how `resolveHooks` is meant to be
extended (per-package, via the namespace's own root export), not by special-casing `@mathpen/manim` inside
a generic runner (`exemplar`'s cli, or `api2/services/scaffold/runExampleFiles.ts`). If the duplication
across packages gets painful, revisit as a small shared hooks export rather than baking mathpen-specific
knowledge into paladin's generic tooling.
