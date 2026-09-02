import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Playground } from "./playground"

const el = document.getElementById("root")
if (!el) throw new Error("missing #root")

createRoot(el).render(
  <StrictMode>
    <Playground/>
  </StrictMode>
)
