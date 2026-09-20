# @paladin/shadcn

Every shadcn component, sonner and `cn`, in one workspace package.

## use

    import {Button, Card, toast, cn} from '@paladin/shadcn'

That is the whole setup. The barrel imports the package's own precompiled
stylesheet, so there is nothing to add to the app's css. Render `<Toaster />
once at the app root and you are done.

Deep imports work too, if you want to skip the barrel:

    import {Button} from '@paladin/shadcn/ui/button'

## the other two modes

**Compile from source.** If the app runs tailwind itself and you would rather
have one build with no duplicated preflight - and you want the app's own markup
to be able to use `bg-background` and friends - add one line to the app's
tailwind entry:

    @import "@paladin/shadcn/source.css";

That file carries its own `@source` directives, so the app does not need to
know where this package lives. Then set `PALADIN_SHADCN_AUTO_CSS=0` and re-run
`bun run barrel` to drop the css import from the barrel.

**Manual.** Same as above, but import `'@paladin/shadcn/styles.css'` from the app
root instead of using tailwind at all.

## adding or updating components

    cd packages/shadcn
    bun run add dialog     # or: bun run add --all --overwrite
    bun run sync           # regenerate src/index.ts + dist/styles.css

`bun run sync` matters: the precompiled stylesheet only contains classes the
components in this package actually use, so it has to be rebuilt whenever
components change.

Components resolve their own imports through `package.json#imports`
(`#components/ui/button`, `#lib/utils`), so nothing in a consuming app needs a
path alias.
