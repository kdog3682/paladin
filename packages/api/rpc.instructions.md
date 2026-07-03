# RPC System

**Flow:** client POSTs `{ method, kwargs }` to `/<pkgname>` → server dispatches to `handlers[method](kwargs)` → returns JSON.

## Backend

Create `src/features/<pkgname>/<filename>.handlers.ts`. The filename should describe the handlers, not repeat the pkgname.

```ts
// @paladin/api/features/cme/editor.handlers.ts

export const handlers = {
  'doc.get': ({ id }: { id: string }) => db.doc.findUnique({ where: { id } }),
  'doc.save': ({ id, content }: { id: string; content: string }) => db.doc.update({ where: { id }, data: { content } }),
}
```

The server auto-discovers all `*.handlers.ts` files under `src/features/`, merges handlers per pkg directory, and mounts each at `/<pkgname>`. No registration needed.

## Frontend

```ts
import { createApiClient } from '@paladin/utils/api'

const api = createApiClient('cme')
const doc = await api.call('doc.get', { id: '123' })
```

The pkgname passed to `createApiClient` must match the `features/<pkgname>/` directory name.
