// Path parsing + display-name derivation for the foundry tree. Layout:
//   <base>/<project>/packages/<pkg>/<relpath>   package file
//   <base>/<project>/<relpath>                   root file
// where base is expandHome(baseProjectDir), e.g. ~/projects.

import { relative, join } from 'path'

export interface Parsed {
  projectName: string
  pkgName: string | null
  relpath: string // path within the owning package (or project, for root files)
}

// Splits an absolute path into project / package / relpath.
export function parsePath(abs: string, base: string): Parsed {
  const segs = relative(base, abs).split('/')
  const projectName = segs[0] ?? ''
  if (segs[1] === 'packages' && segs.length > 2) {
    return { projectName, pkgName: segs[2], relpath: segs.slice(3).join('/') }
  }
  return { projectName, pkgName: null, relpath: segs.slice(1).join('/') }
}

// File label: its path within the owning package/project, e.g. 'src/scene.ts'.
export function fileDisplayName(abs: string, base: string): string {
  return parsePath(abs, base).relpath
}

// Package label: '<project>/<pkg>', e.g. 'mathpen/manim'.
export function packageDisplayName(projectName: string, pkgName: string): string {
  return `${projectName}/${pkgName}`
}

// Project-root label: '@projects/<project>', e.g. '@projects/mathpen'.
export function projectDisplayName(projectName: string): string {
  return `@projects/${projectName}`
}

// Workspace import specifier: '@<project>/<pkg>', e.g. '@mathpen/manim'.
export function workspaceSpec(projectName: string, pkgName: string): string {
  return `@${projectName}/${pkgName}`
}

// Absolute dir a workspace package lives in.
export function packageDir(base: string, projectName: string, pkgName: string): string {
  return join(base, projectName, 'packages', pkgName)
}
