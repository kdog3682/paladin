// @paladin/conversation-processor/utils/extract-header.types.ts

export type HeaderAction = "write" | "delete" | "append"

export type HeaderResult = {
  rawPath: string
  action: HeaderAction
} | null
