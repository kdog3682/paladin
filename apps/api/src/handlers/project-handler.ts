// @paladin/api/src/handlers/project-handler.ts

import { readdir } from "fs/promises"
import { join, homedir } from "os"
import { join } from "path"
import type { WebSocketServer } from "../server"

export class ProjectHandler {
  constructor(private server: WebSocketServer) {}

  init(): void {
    this.server
      .onMessage("getProjects", () => this.sendProjects())
  }

  private async sendProjects(): Promise<void> {
    const projectsDir = join(homedir(), "projects")
    const entries = await readdir(projectsDir, { withFileTypes: true })
    const projects = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
    this.server.broadcast({ type: "projectList", projects })
  }
}
