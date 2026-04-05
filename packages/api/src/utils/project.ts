// @paladin/packages/api/src/utils/project.ts

import { join } from "path"
import { homedir } from "os"

const baseDir = process.env.TMP_DIR || join(homedir(), "projects")

export interface ProjectInfo {
  projectName: string
  packageName: string | undefined
  projectDir: string
  packageDir: string | undefined
}

export function getProjectInfo(input: string): ProjectInfo {
  const parts = input.split("/")

  if (parts.length === 1) {
    const projectName = parts[0]
    return {
      projectName,
      packageName: undefined,
      projectDir: join(baseDir, projectName),
      packageDir: undefined,
    }
  }

  const [projectName, packageName] = parts
  return {
    projectName,
    packageName,
    projectDir: join(baseDir, projectName),
    packageDir: join(baseDir, projectName, "packages", packageName),
  }
}
