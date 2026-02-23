// @paladin/ai/omni/utils/files-api.ts

import Anthropic, { toFile } from "@anthropic-ai/sdk"
import { BETA_FILES_API } from "../types"

const client = new Anthropic()

/** Upload a local file to Anthropic's Files API, returns file_id */
export async function uploadFile(path: string): Promise<string> {
  const file = Bun.file(path)
  const buffer = Buffer.from(await file.arrayBuffer())
  const uploaded = await client.beta.files.upload({
    file: await toFile(buffer, file.name ?? path, {
      type: file.type || "application/octet-stream",
    }),
    betas: [BETA_FILES_API],
  })
  return uploaded.id
}

/** Download a file from Anthropic's Files API to a local path */
export async function downloadFile(fileId: string, outputPath?: string): Promise<string> {
  const metadata = await client.beta.files.retrieveMetadata(fileId, {
    betas: [BETA_FILES_API],
  })
  const response = await client.beta.files.download(fileId, {
    betas: [BETA_FILES_API],
  })
  const dest = outputPath ?? metadata.filename
  const buf = Buffer.from(await response.arrayBuffer())
  await Bun.write(dest, buf)
  return dest
}

/** List all uploaded files */
export async function listUploadedFiles() {
  const page = await client.beta.files.list({
    betas: [BETA_FILES_API],
  })
  return page.data
}

/** Delete a file from Anthropic's storage */
export async function deleteFile(fileId: string) {
  return client.beta.files.delete(fileId, {
    betas: [BETA_FILES_API],
  })
}

/** Extract file IDs from a beta message response's code execution results */
export function extractFileIds(
  content: Anthropic.Beta.BetaContentBlock[]
): string[] {
  const ids: string[] = []
  for (const block of content) {
    if (block.type === "bash_code_execution_tool_result") {
      const result = block.content
      if (result.type === "bash_code_execution_result" && result.content) {
        for (const item of result.content) {
          if ("file_id" in item && item.file_id) {
            ids.push(item.file_id)
          }
        }
      }
    }
  }
  return ids
}
