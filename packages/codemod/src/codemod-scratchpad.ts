import {deleteSymbol} from "./commands/deleteSymbol"
import {initializeProject} from "./initialize"
// import {clip} from "@paladin/clip"


let p = initializeProject('/home/kdog3682/projects/paladin/packages/utils/src/bundle/bundle.ts')


import type { Project } from "ts-morph"

export function changedFiles(project: Project): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of project.getSourceFiles()) {
    if (!file.isSaved()) out.set(file.getFilePath(), file.getFullText())
  }
  return out
}

deleteSymbol(p, 'createProject')
const changed = changedFiles(p)
p.save()
// console.log(Array.from(changed)[1][1])
