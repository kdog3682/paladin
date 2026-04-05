// @paladin/packages/web/src/App.tsx

import { SessionMonitor } from "./components/SessionMonitor"

const WS_URL = `ws://${window.location.hostname}:${import.meta.env.VITE_API_PORT || 4801}/ws`

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>paladin</h1>
      </header>
      <main>
        <SessionMonitor wsUrl={WS_URL} />
      </main>
    </div>
  )
}
