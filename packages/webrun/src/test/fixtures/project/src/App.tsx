// imported through an alias to prove the project's vite config is being merged:
// without `resolve.alias` this import is a hard resolution failure
import { Badge } from "@/Badge"

export default function App() {
  return (
    <main>
      <h1 id="greeting">project hello</h1>
      <Badge />
    </main>
  )
}
