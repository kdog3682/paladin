// @paladin/api/src/index.ts

import { join } from "path"
import { WebSocketServer } from "./server"
import { ArtifactHandler } from "./handlers/artifact-handler"
import { ProjectHandler } from "./handlers/project-handler"

const watchDirectory = join(process.env.HOME!, "scratch/lua_events")
const port = 3000

const server = new WebSocketServer(port)

const projectHandler = new ProjectHandler(server)
projectHandler.init()

const artifactHandler = new ArtifactHandler(server, {
  autoWriteFiles: true,
})
artifactHandler.init()
artifactHandler.setWatchDir(watchDirectory)

server.start()
