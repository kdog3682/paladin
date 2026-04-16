// src/routes/index.ts

import { Hono } from "hono"
import { cors } from "hono/cors"
import ticket from "./ticket"
import git from "./git"
import fs from "./fs"
import source from "./source"
import filewatch, { websocket } from "./filewatch"
import runcode from "./runcode"

const app = new Hono()

app.use("*", cors())

app.route("/ticket", ticket)
app.route("/git", git)
app.route("/fs", fs)
app.route("/source", source)
app.route("/filewatch", filewatch)
app.route("/runcode", runcode)

export { websocket }
export default app
