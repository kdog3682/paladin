// @paladin/web/src/App.tsx
import { KeyBindingProvider } from './providers/KeyBindingProvider'
import { AppShell } from './components/AppShell'

export default function App() {
  return (
    <KeyBindingProvider>
      <AppShell />
    </KeyBindingProvider>
  )
}
