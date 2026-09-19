import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"

createRoot(document.getElementById("mount")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
