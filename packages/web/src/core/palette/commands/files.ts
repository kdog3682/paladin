import type { Completion } from "@paladin/ui"
import { toScopedPath } from "@paladin/utils"
import type { PaladinDeps } from "../deps"
import { defineArgs } from "../define"
import type { PaladinCommand } from "../types"

function pathCompleter(deps: PaladinDeps) {
  return async (partial: string, signal?: AbortSignal): Promise<Completion[]> => {
    const paths = await deps.search.completePath(partial, signal)
    return paths.map((path) => ({ value: path, label: toScopedPath(path) }))
  }
}

export function fileCommands(deps: PaladinDeps): PaladinCommand[] {
  const complete = pathCompleter(deps)

  return [
    defineArgs({
      id: "file.rename",
      title: "Rename file",
      keywords: ["rename", "rename file", "move file", "mv"],
      group: "Files",
      args: [
        {
          name: "from",
          placeholder: "file",
          required: true,
          complete: (partial, _prev, _ctx, signal) => complete(partial, signal),
        },
        {
          name: "to",
          placeholder: "new path",
          required: true,
          /* start from the source path so only the changed part needs typing */
          complete: (partial, prev, _ctx, signal) => complete(partial || prev.from, signal),
        },
      ],
      run: async ({ from, to }) => {
        await deps.fs.rename(from, to)
        return { focus: "restore" }
      },
    }),
  ]
}
