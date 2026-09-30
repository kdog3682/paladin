//
// $ bun run ./src/codemods/commentAudit/commentAudit.demo.ts           dry run, prints the diff
// $ bun run ./src/codemods/commentAudit/commentAudit.demo.ts --write   saves the comments
// $ bun run ./src/codemods/commentAudit/commentAudit.demo.ts --resume <nonce>
//
// the full round trip on ~/projects/mathpen/packages/manim (--dir for another package):
//   1. collects the public api of src/index.ts and every type it pulls in
//   2. writes ~/scratch/commentAudit.request.md
//   3. waits: paste the request into claude, download its commentAudit.txt into ~/scratch
//   4. writes the comments back into the package and reports what is left
import { homedir } from "node:os"
import { join } from "node:path"
import { parseArgs } from "node:util"
import type { Project } from "ts-morph"
import { runCodemod } from "../../run"
import { collectComments, commentAudit } from "./index"

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    write: { type: "boolean", default: false },
    resume: { type: "string" },
    dir: { type: "string" },
  },
})

const dir = values.dir ?? join(homedir(), "projects/mathpen/packages/manim")

async function roundTrip(project: Project) {
  const before = Object.keys(collectComments(project).ids).length
  console.log(`commentAudit.demo: ${dir}`)
  console.log(`commentAudit.demo: ${before} entries need a comment`)

  const report = await commentAudit(project, { resume: values.resume })
  if (!report) return

  const after = Object.keys(collectComments(project).ids).length
  console.log(`commentAudit.demo: ${before} -> ${after} entries need a comment`)
  if (!values.write) console.log("commentAudit.demo: dry run, pass --write to save")
}

await runCodemod({ dir, codemod: roundTrip, dry: !values.write })
