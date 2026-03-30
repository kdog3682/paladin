// @paladin/tooling/view-files.demo.ts

import { collectFiles } from "@paladin/utils/collect-files"
import { toStamp } from "@paladin/stamp"
import { tempwrite } from "@paladin/utils/tempwrite"

const ROOT = "/home/kdog3682/projects/paladin/packages/scaffold-v3"

const files = collectFiles(ROOT, [/\.test\./, /\.spec\./, /\.json$/, /\.config\./, /\.lock$/, /\.yaml$/, /\.yml$/, /\.md$/, /\.txt$/, /\.log$/])
const stamp = toStamp(files)
tempwrite(stamp)
