
# Please use this router system 

## Backend
// @paladin/api/routes/<pkgname>.ts
import { createHandlerRouter } from "@paladin/api"

export const router = createHandlerRouter({
  'doc.get': ({ id }) => db.doc.findUnique({ where: { id } }),
})


## Frontend

import { createApiClient } from "@paladin/utils/api"

export const api = createApiClient(<pkgname>)
const doc = await api.call('doc.get', { id: '123' })

**Flow:** client POSTs `{ method, kwargs }` to `/<pkgname>` → server matches `handlers[method]` → returns JSON.

Important: the pkgname needs to match.