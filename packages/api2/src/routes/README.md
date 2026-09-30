# routes

Every file in this folder becomes a route group, except `base.ts` and `index.ts`. Groups are mounted under `API_PREFIX` (`/api`, from `base.ts`) with the lowercased file name after it, so `Claude.ts` is served at `/api/claude`.

Keeping every group under one prefix means a dev server needs a single proxy entry for `/api` rather than one per route file.

A file is mounted only if it has a default export. Anything without one is ignored.

## adding a route file

```ts
// @paladin/api2/src/routes/todos.ts
import {createRouter, fail} from './base'

const app = createRouter()

// GET /api/todos
app.get('/', () => [])

// POST /api/todos/:id/done   (path params are typed from the route string)
app.post('/:id/done', ({id}) => ({id, done: true}))

// POST /api/todos   (annotate the body/query yourself)
app.post('/', ({title}: {title: string}) => {
  if (!title) fail(400, 'title is required')
  return {title}
})

export default app
```

## how handlers work

- The input is the query, the json body and the path params merged into one object. If a key appears in more than one, the path param wins.
- The value you return is sent as plain json with a 200 status. `undefined` is sent as `null`.
- `fail(status, msg)` or `throw new HttpError(status, msg)` is sent as `{error}` with that status. Any other error becomes a 500.
