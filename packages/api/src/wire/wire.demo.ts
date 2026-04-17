import { wire } from "./index"
import { resolvePath } from "../processors/claude/utils/resolve-path"
import { writeFileSafe } from "../utils/fs"

// stub file contents

const schemaSource = `// auto-stubbed for wire demo
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const todos = sqliteTable('todos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
})
`

const todoServiceSource = `// auto-stubbed for wire demo

// POST /create
export async function createTodo(title: string, priority: 'low' | 'high') {
  return { id: 1, title, priority }
}

// GET /list
export async function listTodos(limit: number) {
  return { items: [], limit }
}

// POST /toggle
export async function toggleTodo(id: number, done: boolean) {
  // no return
}
`

const inboxAppletSource = `// auto-stubbed for wire demo
export function Inbox() {
  return <div className="p-4">Inbox</div>
}
`

async function stubFiles() {
  const schemaPath = resolvePath("@paladin/api/src/db/schema.ts")
  const servicePath = resolvePath(
    "@paladin/api/src/features/todo/todo.service.ts",
  )
  const appletPath = resolvePath(
    "@paladin/web/src/components/applets/Inbox.tsx",
  )

  await writeFileSafe(schemaPath, schemaSource)
  await writeFileSafe(servicePath, todoServiceSource)
  await writeFileSafe(appletPath, inboxAppletSource)

  return [schemaPath, servicePath, appletPath]
}

const paths = await stubFiles()
const result = await wire(paths)

console.log("wire() complete")
console.log("  written:", result.written)
console.log("  modified:", result.modified)
