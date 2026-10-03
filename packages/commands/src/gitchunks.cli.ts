#!/usr/bin/env bun

import { type Spec, runArgv } from "@paladin/utils"
import { parseGitChunks } from "./gitchunks"

const spec = {
  bin: "gitchunks",
  intro: "split working tree changes into feat / fix / refactor / deprecate / chore commits per package unit",
  args: [{ name: "dir", help: "git repo root (default ~/projects/mathpen)", optional: true }],
  kwargs: { dry: { alias: "n", help: "print the plan without committing" } },
} as const satisfies Spec

if (import.meta.main) {
  runArgv(spec, process.argv.slice(2), ({ args, kwargs }) =>
    parseGitChunks(args.dir ?? "~/projects/mathpen", { dry: kwargs.dry }),
  ).then((code) => {
    process.exitCode = code
  })
}
