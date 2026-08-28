import {deleteSymbol} from "./commands/deleteSymbol"
import {renameSymbol} from "./commands/renameSymbol"
import {initializeProject} from "./initialize"
import {filesToBundle} from "@paladin/utils"




import type { Project } from "ts-morph"

export function changedFiles(project: Project): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of project.getSourceFiles()) {
    if (!file.isSaved()) out.set(file.getFilePath(), file.getFullText())
  }
  return out
}

// let p = initializeProject('/home/kdog3682/projects/paladin/packages/utils/src/bundle/bundle.ts')
let p = initializeProject('/home/kdog3682/projects/mathpen/manim')

moveSymbol(p, 'dash')
const changed = changedFiles(p)
p.save()
// console.log(Array.from(changed)[1][1])

// /home/kdog3682/projects/mathpen/packages/manim/src/node/style.ts