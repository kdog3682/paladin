import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"
import { analyze, docgen } from "./docgen"
import type { DocEntry } from "./docgen.types"
import {collectFiles, clip} from "@paladin/utils"

// clip(

// const files = collectFiles('/home/kdog3682/projects/paladin/packages/codemod/src/utils')
const files = ['/home/kdog3682/projects/mathpen/packages/manim/src/math/expr/index.ts']
const files = ['/home/kdog3682/projects/paladin/packages/docgen/src/parse.ts']

console.log(await docgen(files))