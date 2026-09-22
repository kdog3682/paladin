#!/usr/bin/env bun

import { argParseRunner } from "@paladin/utils"
import { parseGitChunks } from "./gitchunks"

if (import.meta.main) {
  argParseRunner(parseGitChunks, {
    name: "gitchunks",
    abstract: "split working tree changes into feat / fix / refactor / deprecate / chore commits per package unit",
    args: [{ name: "dir", help: "git repo root", fallback: "~/projects/mathpen" }],
    kwargs: [{ name: "dry", alias: "n", help: "print the plan without committing", default: false }],
  })
}
