import { join } from 'node:path'
import { mkdir, writeFile, access } from 'node:fs/promises'

const HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>web-demo-runner</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/web-demo-runner.main.tsx"></script>
  </body>
</html>
`

const MAIN = `// web-demo-runner.main.tsx
import { createRoot } from 'react-dom/client'
import App from './web-demo-runner.app'

createRoot(document.getElementById('root')!).render(<App />)
`

const APP = `// web-demo-runner.app.tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { routes } from './web-demo-runner.generated'

const router = createBrowserRouter(
  routes.map(({ slug, Component }) => ({
    path: slug,
    element: (
      <div data-demo-root style={{ display: 'inline-block' }}>
        <Component />
      </div>
    ),
  })),
  { basename: '/web-demo-runner' },
)

export default function App() {
  return <RouterProvider router={router} />
}
`

// Created once at the package root. These never change.
export async function ensureStatic(root: string) {
  const src = join(root, 'src')
  await mkdir(src, { recursive: true })
  await writeOnce(join(root, 'web-demo-runner.html'), HTML)
  await writeOnce(join(src, 'web-demo-runner.main.tsx'), MAIN)
  await writeOnce(join(src, 'web-demo-runner.app.tsx'), APP)
}

async function writeOnce(path: string, content: string) {
  try {
    await access(path)
  } catch {
    await writeFile(path, content)
  }
}
