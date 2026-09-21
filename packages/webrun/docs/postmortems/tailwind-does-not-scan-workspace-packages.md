# Tailwind classes from a sibling workspace package had no CSS in the webrun preview

**Where:** `packages/webrun` (generated `styles.css`), seen while previewing
`packages/ui/src/components/HelpPalette.examples.tsx`, which renders `Kbd` from `@paladin/shadcn`
(`packages/shadcn/src/components/ui/kbd.tsx`).

## Symptom

Classes added to `kbd.tsx` (`border-black!`, `text-[8px]`, `dark:border-white!`) did nothing in the
preview. The element carried every class, but in the browser:

```
border-color: oklch(0.922 0 0)   /* the base --border, not black */
font-size:    14px               /* not 8px */
```

`web-probe` showed the served CSS had no rule for `.border-black\!`, `.text-\[8px\]` or
`.dark\:border-white\!`, while `h-5`, `rounded-sm`, `bg-neutral-100` were there.

It looked like `border-black!` was broken. It wasn't: compiling `kbd.tsx` on its own with the Tailwind
CLI generated `.border-black\!` correctly, and the trailing `!` is valid Tailwind v4 syntax.

## Cause

In a virtual shell, webrun writes `node_modules/.webrun/<hash>/styles.css` from
`templates/styles.css.tmpl`, which was:

```css
@import "tailwindcss";
@source "<project>";
```

`<project>` is the nearest `package.json` of the app, here `packages/ui`. Tailwind never looks past
that. `@paladin/shadcn` is a workspace dependency, symlinked from `node_modules` to
`packages/shadcn`, a real path outside `packages/ui`, and Tailwind skips `node_modules` anyway.

So a class in `kbd.tsx` only got CSS if some file under `packages/ui` happened to use the same literal
class. `h-5` and `rounded-sm` did; `border-black!` and `text-[8px]` did not. Edits to the shadcn
component looked like they had no effect.

## Fix

- `workspaceSources(project)` in `src/paths.ts`: for each dependency in the project's `package.json`
  (dependencies, devDependencies, peerDependencies), resolve `node_modules/<name>` up the tree. If the
  real path is outside the project and not inside a `node_modules` directory, use its `src/` (or the
  package dir if it has no `src`).
- `plan()` in `src/detect.ts` stores them as `layout.sources`, only when tailwind is installed.
- `writeShell()` in `src/scaffold.ts` renders them into `styles.css.tmpl` (`{{sources}}`) as one
  `@source` line each. The preview's `styles.css` now also has
  `@source ".../packages/shadcn/src"`.

Checked after the fix: `.text-[5px]` (the value in the file at that moment) had a generated rule.

## Gotcha

A server already running the same app is reused as is (`webrun()` reuse path), so `styles.css` is not
rewritten. Restart with `webrun --stop`, then run it again.

## Follow-up

Only package.json dependencies are checked. A workspace package that is imported but not declared as a
dependency is still not scanned. A consumer app building outside webrun needs its own `@source` for
the package; `@paladin/shadcn/source.css` exists for that (its comment says to import it from the
app's Tailwind entry).
