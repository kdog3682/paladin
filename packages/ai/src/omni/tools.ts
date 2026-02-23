// @paladin/ai/omni/tools.ts

import type { Tool } from "./types"
import { $ } from "bun"
import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"

export const tools: Tool[] = [
  {
    name: "read",
    description: "Read the contents of a file at the given path relative to the working directory.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to read" },
      },
      required: ["path"],
    },
  },
  {
    name: "write",
    description: "Create a new file with the given content. Creates parent directories if needed.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to create" },
        content: { type: "string", description: "Full file content" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit",
    description: "Make a precise edit to an existing file by replacing an exact string match. Use read first to see the current content.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to edit" },
        old_str: { type: "string", description: "Exact string to find (must match uniquely)" },
        new_str: { type: "string", description: "Replacement string" },
      },
      required: ["path", "old_str", "new_str"],
    },
  },
  {
    name: "bash",
    description: "Run a shell command. Use for git, running scripts, installing deps, etc.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
        cwd: { type: "string", description: "Working directory (defaults to process.cwd())" },
      },
      required: ["command"],
    },
  },
  {
    name: "glob",
    description: "Find files matching a glob pattern. Returns matching file paths.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern (e.g. '**/*.ts', 'src/**/*.py')" },
        cwd: { type: "string", description: "Base directory (defaults to '.')" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "grep",
    description: "Search file contents with a regex pattern. Returns matching lines with file paths.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
        path: { type: "string", description: "File or directory to search (defaults to '.')" },
        include: { type: "string", description: "Glob to filter files (e.g. '*.ts')" },
      },
      required: ["pattern"],
    },
  },
]

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  verbose = false
): Promise<string> {
  try {
    switch (name) {
      case "read": {
        const { path } = input as { path: string }
        if (verbose) console.log(`  📖 ${path}`)
        const file = Bun.file(path)
        if (!(await file.exists())) return `Error: file not found: ${path}`
        return await file.text()
      }

      case "write": {
        const { path, content } = input as { path: string; content: string }
        if (verbose) console.log(`  ✏️  ${path}`)
        await mkdir(dirname(path), { recursive: true })
        await Bun.write(path, content)
        return `Wrote ${content.length} bytes to ${path}`
      }

      case "edit": {
        const { path, old_str, new_str } = input as { path: string; old_str: string; new_str: string }
        if (verbose) console.log(`  🔧 ${path}`)
        const file = Bun.file(path)
        if (!(await file.exists())) return `Error: file not found: ${path}`
        const text = await file.text()
        const count = text.split(old_str).length - 1
        if (count === 0) return `Error: old_str not found in ${path}`
        if (count > 1) return `Error: old_str matches ${count} times in ${path}, must be unique`
        await Bun.write(path, text.replace(old_str, new_str))
        return `Edited ${path}`
      }

      case "bash": {
        const { command, cwd } = input as { command: string; cwd?: string }
        if (verbose) console.log(`  🐚 ${command}`)
        const result = await $`sh -c ${command}`.cwd(cwd ?? process.cwd()).quiet().nothrow()
        const stdout = result.stdout.toString().trim()
        const stderr = result.stderr.toString().trim()
        return [
          stdout && `stdout:\n${stdout}`,
          stderr && `stderr:\n${stderr}`,
          `exit code: ${result.exitCode}`,
        ].filter(Boolean).join("\n\n")
      }

      case "glob": {
        const { pattern, cwd = "." } = input as { pattern: string; cwd?: string }
        if (verbose) console.log(`  🔍 ${pattern}`)
        const glob = new Bun.Glob(pattern)
        const matches: string[] = []
        for await (const match of glob.scan({ cwd, dot: false })) {
          if (!match.includes("node_modules") && !match.includes(".git/")) {
            matches.push(match)
          }
        }
        return matches.length ? matches.sort().join("\n") : "No matches found."
      }

      case "grep": {
        const { pattern, path = ".", include } = input as { pattern: string; path?: string; include?: string }
        if (verbose) console.log(`  🔎 /${pattern}/ in ${path}`)
        const args = ["grep", "-rn", "--color=never"]
        if (include) args.push(`--include=${include}`)
        args.push(pattern, path)
        const result = await $`${args}`.quiet().nothrow()
        const output = result.stdout.toString().trim()
        return output || "No matches found."
      }

      default:
        return `Unknown tool: ${name}`
    }
  } catch (e) {
    return `Error: ${(e as Error).message}`
  }
}
