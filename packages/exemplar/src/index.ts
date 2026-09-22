/*
exemplar — snapshot testing for `.examples.` files.

an examples file exports one callable per case. each one is called with no
arguments, its return value serialized, and the result stored under
`<pkg>/snapshots/<flattened-relpath>.cache.json`, keyed by the export name.
the docstring on each export is treated as the statement that example asserts,
so a failure reads as a sentence rather than a symbol name.

serialize and display are resolved from the owning package's own entry point
(`@scope/name`) unless overridden per call with a spec string.

  runExampleFiles(paths, options?)
    the authoring loop. runs the given files and renders the results through
    the namespace's display hook. pass `snapshot` to write baselines for
    anything new (off by default), and `update` to also accept changed output
    as the new baseline — without it, changed output is reported and the
    stored baseline is left alone.

  runTest(pkgdir, options?)
    the ci loop. discovers what to run from the package's snapshot dir, replays
    it, and returns the statements that held and the ones that didn't. writes
    nothing and never calls display, so it is safe to run anywhere. a file with
    no snapshot yet is invisible to it — run runExampleFiles first.
*/

export { runExampleFiles } from "./runFiles"
export { runTest } from "./runTest"
