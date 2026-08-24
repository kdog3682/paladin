import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"
import { analyze, docgen } from "./docgen"
import type { DocEntry } from "./docgen.types"
import {collectFiles, clip} from "@paladin/utils"

// clip(

const files = collectFiles('/home/kdog3682/projects/paladin/packages/codemod/src/utils')

clip(await docgen(files))