import { homedir } from "os"
import { join } from "path"

export function expandHome(path: string): string {
  if (!path.startsWith("~")) return path
  if (path === "~") return homedir()

  return join(homedir(), path.slice(2))
}