#!/usr/bin/env bun
import {resolve} from "node:path"
import {statSync} from "node:fs"
import {type Spec, runArgv} from "@paladin/utils"
import {buildReactApp} from "./build-react-app"

const WEB2_SRC = resolve(import.meta.dir, "../../web2/src")

/* most recently modified *.app.tsx or App.tsx under web2/src */
function findLatestAppEntry(root: string): string | undefined {
  const glob = new Bun.Glob("**/{*.app.tsx,App.tsx}")
  let best: {path: string, mtime: number} | undefined
  for (const rel of glob.scanSync({cwd: root, onlyFiles: true})) {
    if (rel.includes("node_modules")) continue
    const path = resolve(root, rel)
    const mtime = statSync(path).mtimeMs
    if (!best || mtime > best.mtime) best = {path, mtime}
  }
  return best?.path
}

const spec = {
  bin: "build-react-app",
  intro: "build a react app from a tsx entry file",
  args: [
    {
      name: "entry",
      help: "path to the entry tsx (defaults to the most recent *.app.tsx or App.tsx in web2/src)",
      optional: true,
    },
  ],
} as const satisfies Spec

runArgv(spec, process.argv.slice(2), async ({args}) => {
  const entry = args.entry ?? findLatestAppEntry(WEB2_SRC)
  if (!entry) throw new Error(`no entry given and no *.app.tsx / App.tsx found in ${WEB2_SRC}`)
  const res = await buildReactApp(resolve(entry))
  return {
    entry,
    root: res.root,
    usedExisting: res.usedExisting,
    outFile: res.outFile,
  }
}).then((code) => {
  process.exitCode = code
})
