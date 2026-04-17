// src/server.ts

import app, { websocket } from './routes'

export default {
  port: 3001,
  fetch: app.fetch,
  websocket,
}
