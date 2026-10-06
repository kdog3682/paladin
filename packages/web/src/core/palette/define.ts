import { createDefiners } from "@paladin/ui"
import type { PaladinCtx, PaladinEntry, PaladinItem, PaladinResult, PaladinCommand } from "./types"

/* definers pre-bound to the paladin context and result */
export const { defineAction, defineArgs, defineList, defineText } = createDefiners<
  PaladinCtx,
  PaladinResult
>()

export const itemEntry = (item: PaladinItem): PaladinEntry => ({ kind: "item", item })

export const commandEntry = (command: PaladinCommand): PaladinEntry => ({ kind: "command", command })
