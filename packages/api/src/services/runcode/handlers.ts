// src/services/runcode/handlers.ts

import { bash } from "../../utils/bash"
import { mochi } from "@paladin/mochi"
import type { HandlerDef } from "./types"

export const handlers: HandlerDef[] = [
  {
    name: "test",
    suffix: ".test.",
    run: async (file) => bash(["bun", "test", file]),
    pairs: true,
    autoRun: true,
  },
  {
    name: "demo",
    suffix: ".demo.",
    run: async (file) => bash(["bun", "run", file]),
    pairs: true,
    autoRun: true,
  },
  {
    name: "mochi",
    suffix: ".mochi.",
    run: mochi,
    pairs: true,
    autoRun: true,
  },
]
