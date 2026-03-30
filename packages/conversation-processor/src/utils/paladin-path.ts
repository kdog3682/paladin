// @paladin/conversation-processor/utils/paladin-path.ts

import { join } from "path"
import { homedir } from "os"

const BASE = join(homedir(), ".paladin")

export function paladinPath(...segments: string[]) {
  return join(BASE, ...segments)
}
