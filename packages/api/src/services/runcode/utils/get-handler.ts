// src/services/runcode/utils/get-handler.ts

import { basename } from "node:path"
import type { HandlerDef } from "../types"

export function getHandler(file: string, handlers: HandlerDef[]): HandlerDef | null {
  const base = basename(file)
  return handlers.find((h) => base.includes(h.suffix)) ?? null
}
