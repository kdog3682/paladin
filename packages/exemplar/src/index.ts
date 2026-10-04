/*
exemplar — snapshot testing for `.examples.` files.

an examples file exports one callable per case. each one is called with no
arguments, its return value serialized, and the result stored under
`~/.paladin/cache/exemplar/<flattened-path>/cache.json`, keyed by the export
name (see snapshots.ts).
the docstring on each export is treated as the statement that example asserts,
so a failure reads as a sentence rather than a symbol name.

serialize and display are resolved from the owning package's own entry point
(`@scope/name`) unless overridden per call with a spec string.

  runExampleFiles(paths, options?)
    the authoring loop. runs the given files and renders the results through
    the namespace's display hook. baselines for anything new are always
    written; pass `update` to also accept changed output as the new baseline — without it, changed output is reported and the
    stored baseline is left alone.

  runTest(pkgdir, options?)
    the ci loop. replays every examples file in the package that has a
    baseline through runExampleFiles, and returns the statements that held
    and a unified diff (baseline -> current) for each one that didn't.
    changed baselines are never overwritten. a file with no baseline yet is
    invisible to it — run runExampleFiles first.
*/

export { runExampleFiles } from "./runFiles"
export { runTest } from "./runTest"
export type { ExampleFile, ExampleItem, ExampleReport } from "./base"
