import { gitOut } from "./base.ts"

/* stage and commit only the given paths (other staged changes stay staged), returns the short sha */
export async function commitPaths(dir: string, message: string, paths: string[]): Promise<string> {
  if (!paths.length) throw new Error(`commitPaths: no paths for "${message}"`)
  await gitOut(dir, ["add", "-A", "--", ...paths])
  await gitOut(dir, ["commit", "--only", "-m", message, "--", ...paths])
  return (await gitOut(dir, ["rev-parse", "--short", "HEAD"])).trim()
}
