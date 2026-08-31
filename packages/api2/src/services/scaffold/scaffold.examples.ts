import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ScaffoldService } from "./scaffold"
import {clipBuffer} from "@paladin/utils"

/* ------------------------------------------------------------------ plan */

/** smallest input that plans: one scope, one unit, one module */
const SINGLE_MODULE = `
// @acme/widget/src/add.ts
export const add = (a: number, b: number) => a + b
`

/** same paths, different bodies — second pass should rewrite rather than skip */
const SINGLE_MODULE_EDITED = `
// @acme/widget/src/add.ts
export const add = (a: number, b: number) => {
  return a + b
}
`

const EXTERNAL_PROJECT = `
// @other/thing/src/two.ts
export const two = 2
`

/* ------------------------------------------------------------ updateBarrel */

/**  */
const CREATE_BARRELS = `
// @acme/utils/src/upper.ts
export const upper = (s: string) => s.toUpperCase()

// @acme/widget/src/lib/lower.ts
export const lower = (s: string) => s.toLowerCase()
`

/** things the barrel should ignore: tests, helpers under src/test, non-source, out-of-src */
const UNEXPORTABLE = `
// @acme/widget/src/test/fixtures.ts
export const sample = { id: 1, name: "sample" }

// @acme/widget/src/test/pad.test.ts
import { expect, test } from "bun:test"
import { pad } from "../pad"
import { sample } from "./fixtures"
test("pad widens", () => {
  expect(pad(String(sample.id), 3)).toBe("  1")
})

// @acme/widget/src/data.json
{ "locale": "en-GB" }

// @acme/widget/README.md
# widget

string helpers

// @acme/widget/scripts/release.ts
console.log("release")
`

/* ------------------------------------------------------ deleteShadowedFiles */

/** step 1: a flat module, so there is something to shadow later */
const SHADOW_SETUP = `
// @acme/widget/src/format.ts
export const format = (n: number) => n.toFixed(2)
`

/** step 2: same name, now a directory — the flat file beside it should go */
const SHADOW_FILE_BY_DIR = `
// @acme/widget/src/format/index.ts
export * from "./currency"

// @acme/widget/src/format/currency.ts
export const currency = (n: number) => "$" + n.toFixed(2)
`

/** step 3: back to a flat module — the now-unwritten directory should go */
const SHADOW_DIR_BY_FILE = `
// @acme/widget/src/format.ts
export const format = (n: number, unit = "$") => unit + n.toFixed(2)
`

/* ----------------------------------------------------- resolveDependencies */

/** builtins only — nothing to install, no manifest merge */
const BUILTIN_IMPORTS = `
// @acme/widget/src/here.ts
import { join } from "node:path"
import { homedir } from "node:os"
export const here = (name: string) => join(homedir(), name)
`

/** external, scoped, and deep-imported packages — all resolve to their package root */
const EXTERNAL_DEPS = `
// @acme/widget/src/schema.ts
import { z } from "zod"
import debounce from "lodash/debounce"
import { faker } from "@faker-js/faker"
export const Row = z.object({ id: z.string(), name: z.string() })
export const fake = () => ({ id: faker.string.uuid(), name: faker.person.firstName() })
export const settle = debounce(() => {}, 10)
`

/** only the test file pulls msw in — it should land in devDependencies */
const DEV_ONLY_DEP = `
// @acme/widget/src/fetchRow.ts
export const fetchRow = async (id: string) => (await fetch("/rows/" + id)).json()

// @acme/widget/src/test/fetchRow.test.ts
import { expect, test } from "bun:test"
import { http, HttpResponse } from "msw"
import { fetchRow } from "../fetchRow"
test("fetchRow hits the endpoint", () => {
  expect(typeof http.get).toBe("function")
  expect(HttpResponse).toBeDefined()
  expect(typeof fetchRow).toBe("function")
})
`

/** two units in one project, one importing the other, plus a self-import */
const LOCAL_DEPS = `
// @acme/core/src/id.ts
export const id = () => Math.random().toString(36).slice(2)

// @acme/app/src/session.ts
import { id } from "@acme/core"
import { touch } from "@acme/app"
export const session = () => ({ token: id(), at: touch() })

// @acme/app/src/touch.ts
export const touch = () => Date.now()
`

/** the unit writes its own manifest, already declaring one of its imports */
const AUTHORED_MANIFEST = `
// @acme/widget/package.json
{
  "name": "@acme/widget",
  "version": "0.1.0",
  "dependencies": {
    "zod": "^3.23.0"
  }
}

// @acme/widget/src/parse.ts
import { z } from "zod"
import { parse } from "date-fns"
export const When = z.string()
export const when = (s: string) => parse(s, "yyyy-MM-dd", new Date())
`

/* ------------------------------------------------------------- codeRunner */

/** a test file the runner should turn into a bun test command */
const RUNNABLE_TEST = `
// @acme/widget/src/slug.ts
export const slug = (s: string) => s.toLowerCase().replace(/\\s+/g, "-")

// @acme/widget/src/test/slug.test.ts
import { expect, test } from "bun:test"
import { slug } from "../slug"
test("slug hyphenates", () => {
  expect(slug("Hello World")).toBe("hello-world")
})
`

/** a failing test — the command runs, exits non-zero, and apply keeps going */
const FAILING_TEST = `
// @acme/widget/src/test/broken.test.ts
import { expect, test } from "bun:test"
test("this one fails on purpose", () => {
  expect(1).toBe(2)
})
`

/** an entrypoint rather than a test — exercises the other registrations */
const RUNNABLE_MAIN = `
// @acme/widget/src/main.ts
import { slug } from "./slug"
if (import.meta.main) console.log(slug("run me"))
`

/* -------------------------------------------------- hydrateBoilerplate / tsx */

/** a brand new scope, so the project-level boilerplate has to be laid down */
const FRESH_PROJECT = `
// @fresh/ui/src/Button.tsx
import { useState } from "react"
export function Button({ label }: { label: string }) {
  const [n, setN] = useState(0)
  return <button onClick={() => setN(n + 1)}>{label} {n}</button>
}
`

/* ------------------------------------------------------------------- usage */

export async function examples() {
  const base = mkdtempSync('/tmp')
  const scaffold = new ScaffoldService({ emit: clipBuffer, pathResolution: { base },  })

  await scaffold.process(SINGLE_MODULE)
  // writes src/add.ts, appends export * from "./add" to src/index.ts,
  // hydrates @acme/widget's package.json + tsconfig, no install (no deps gained),
  // and git-inits the project dir

  await scaffold.process(SINGLE_MODULE)
  // same bytes: src/add.ts comes back as a skip, the barrel is not appended twice

  await scaffold.process(SINGLE_MODULE_EDITED)
  // src/add.ts is rewritten (mode "write"), barrel still untouched —
  // the export line is already in the file

  await scaffold.process(NO_HEADERS)
  // no unit could be planned, so process resolves null and nothing hits disk

  await scaffold.process(MIXED_SCOPES)
  // two scopes in one input — expect the project to be whichever scope plan
  // picks first; the point of this one is to pin that behaviour down

  await scaffold.process(NESTED_MODULES)
  // barrel gains ./lib/upper and ./lib/lower — paths are relative to the barrel,
  // not the unit root

  await scaffold.process(AUTHORED_BARREL)
  // the authored barrel already exports ./trim, so only ./pad is appended;
  // the barrel itself is never exported from itself

  await scaffold.process(UNEXPORTABLE)
  // all five files are written, none are exported: the test and its fixtures live
  // under src/test, data.json and README.md aren't .ts, and scripts/ is outside src

  await scaffold.process(SHADOW_SETUP)
  // plain write of src/format.ts, exported from the barrel

  await scaffold.process(SHADOW_FILE_BY_DIR)
  // src/format/ is written, and the stale src/format.ts sitting beside it is
  // removed — note the barrel now has a dangling ./format line pointing at the
  // directory, which resolves via index.ts

  await scaffold.process(SHADOW_DIR_BY_FILE)
  // back to the flat file: the unit owns src/format.ts and nothing under
  // src/format/, so the directory is removed

  await scaffold.process(BUILTIN_IMPORTS)
  // node:path and node:os are skipped, the manifest gains nothing,
  // and no bun install is queued

  await scaffold.process(EXTERNAL_DEPS)
  // dependencies gain zod, lodash and @faker-js/faker (lodash/debounce collapses
  // to its package root), each version fetched once and folded into
  // npm-dependencies.json via a merge op, then one bun install at the project root

  await scaffold.process(EXTERNAL_DEPS)
  // second pass: versions come from the cache, no registry calls, and since the
  // deps are now declared the manifest merge is skipped entirely

  await scaffold.process(DEV_ONLY_DEP)
  // msw is only imported from src/test, so it lands in devDependencies while
  // nothing is added to dependencies

  await scaffold.process(LOCAL_DEPS)
  // @acme/app gains @acme/core at its workspace spec rather than a registry
  // version, the self-import of @acme/app is ignored, and the two units' installs
  // fold into a single bun install

  await scaffold.process(AUTHORED_MANIFEST)
  // zod is already declared in the authored package.json so it's left alone;
  // only date-fns is merged in, on top of the manifest this pass is writing

  await scaffold.process(RUNNABLE_TEST)
  // src/slug.ts is written and exported, the test file is written but not
  // exported, and the runner emits ["bun", "test", <spec path>] with cwd at the
  // unit dir — apply runs it and records exitCode 0

  await scaffold.process(FAILING_TEST)
  // same shape, non-zero exit: the op carries the failure but the surrounding
  // writes still applied

  await scaffold.process(RUNNABLE_MAIN)
  // an entrypoint rather than a spec — runnableKind keeps it out of the barrel
  // and hands it to whichever registration claims it

  await scaffold.process(FRESH_PROJECT)
  // a scope that doesn't exist yet: project + unit boilerplate is hydrated,
  // react is resolved from the registry, and the .tsx module is exported
  // from the barrel like any other source file


}

examples()