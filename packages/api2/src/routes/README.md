# routes

Every file in this folder becomes a route group, except `base.ts` and `index.ts`. The lowercased file name is the prefix, so `Claude.ts` is served at `/claude`.

A file is mounted only if it has a default export. Anything without one is ignored.

## adding a route file

```ts
// @paladin/api2/src/routes/todos.ts
import {createRouter, fail} from './base'

const app = createRouter()

// GET /todos
app.get('/', () => [])

// POST /todos/:id/done   (path params are typed from the route string)
app.post('/:id/done', ({id}) => ({id, done: true}))

// POST /todos   (annotate the body/query yourself)
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
