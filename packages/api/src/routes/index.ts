// src/routes/index.ts

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import ticket from './ticket'
import git from './git'
import fs from './fs'
import source from './source'

const app = new Hono()

app.use('*', cors())

app.route('/ticket', ticket)
app.route('/git', git)
app.route('/fs', fs)
app.route('/source', source)

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: err.message }, 500)
})

export default app
