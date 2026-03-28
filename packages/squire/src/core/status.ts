// @paladin/squire/src/core/status.ts

import { latestVersion, type VersionInfo } from "./version"

export type WatchState = {
  demo: boolean
  test: boolean
  testPattern?: string
}

export type SquireStatus = {
  pkg: string
  pkgDir: string
  latestVersion: number
  watchState: WatchState
  dirtyFiles: string[]
}

export function buildStatus(
  pkg: string,
  pkgDir: string,
  history: VersionInfo[],
  watchState: WatchState,
  dirtyFiles: string[]
): SquireStatus {
  const pkgEntries = history.filter(e => e.pkg === pkg)
  return {
    pkg,
    pkgDir,
    latestVersion: latestVersion(pkgEntries),
    watchState,
    dirtyFiles,
  }
}
