// src/server.ts

import app from './routes'

export default {
  port: 3001,
  fetch: app.fetch,
}
