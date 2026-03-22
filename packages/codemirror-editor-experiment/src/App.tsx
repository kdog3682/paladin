// @paladin/codemirror-editor-experiment/App.tsx
import { Editor } from './Editor'

export default function App() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-start justify-center px-4 pt-16">
      <div className="w-full max-w-3xl flex flex-col gap-4">
        <h1 className="text-lg font-medium text-slate-700 tracking-tight">
          Editor
        </h1>
        <Editor />
      </div>
    </main>
  )
}
