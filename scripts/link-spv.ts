import { writeFileSync, existsSync } from "node:fs"
import { resolve, relative } from "node:path"

// ---- config ----
const HOME = process.env.HOME as string
const CME_ROOT = resolve(HOME, "projects/paladin/packages/cme")
const SPV_ROOT = resolve(HOME, "projects/paladin/packages/simple-project-viewer")
const PAGE_NAME = "second" // -> second.html
const SPV_ENTRY = "src/main.tsx" // spv's entry module (check spv/index.html)
const MOUNT_ID = "root" // #id spv's main.tsx mounts into
// ----------------

const entryAbs = resolve(SPV_ROOT, SPV_ENTRY)
if (!existsSync(entryAbs)) throw new Error(`missing ${entryAbs}`)

const entryFile = `${PAGE_NAME}-entry.ts`
const importSpec = relative(CME_ROOT, entryAbs) // ../simple-project-viewer/src/main.tsx

// entry lives inside cme, so the html url stays under root (no ../ in the browser)
writeFileSync(resolve(CME_ROOT, entryFile), `import "${importSpec}"\n`)

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${PAGE_NAME}</title>
  </head>
  <body>
    <div id="${MOUNT_ID}"></div>
    <script type="module" src="/${entryFile}"></script>
  </body>
</html>
`

writeFileSync(resolve(CME_ROOT, `${PAGE_NAME}.html`), html)
console.log(`wrote ${PAGE_NAME}.html -> /${entryFile} -> ${importSpec}`)
