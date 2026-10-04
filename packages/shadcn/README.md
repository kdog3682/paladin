# @paladin/shadcn

Every shadcn component, sonner and `cn`, in one workspace package.

## use

    import {Button, Card, toast, cn} from '@paladin/shadcn'

Add one line to the app's tailwind entry, after `@import "tailwindcss";`:

    @import "@paladin/shadcn/source.css";

That file carries the theme and its own `@source` directives, so the app does
not need to know where this package lives, and the app's own markup can use
`bg-background` and friends. There is no precompiled stylesheet: the app's
tailwind build compiles the components. Render `<Toaster />` once at the app
root and you are done.

The package is not listed in consuming apps' `package.json`; it resolves
through the workspace's hoisted `node_modules/@paladin/shadcn` link.

Deep imports work too, if you want to skip the barrel:

    import {Button} from '@paladin/shadcn/ui/button'

## adding or updating components

    cd packages/shadcn
    bun run add dialog     # or: bun run add --all --overwrite
    bun run sync           # regenerate src/index.ts + src/styles/source.css

`bun run sync` matters: the barrel only exports what was there the last time
it ran, so it has to be regenerated whenever components change.

Components resolve their own imports through `package.json#imports`
(`#components/ui/button`, `#lib/utils`), so nothing in a consuming app needs a
path alias.
