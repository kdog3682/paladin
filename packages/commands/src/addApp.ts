import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const pascal = (s: string) =>
  s.replace(/(^|[-_ ]+)([a-zA-Z0-9])/g, (_, __, c: string) => c.toUpperCase())

export async function addApp(dir: string, name: string): Promise<void> {
  if (!existsSync(join(dir, 'index.html'))) {
    throw new Error(`index.html not found in ${dir}`)
  }

  const Name = pascal(name)
  const mainFile = join(dir, `main.${name}.tsx`)
  const htmlFile = join(dir, `${name}.html`)

  if (existsSync(htmlFile)) return

  let touched = false
  if (!existsSync(mainFile)) {
    touched = true
    await writeFile(
      mainFile,
      `// main.${name}.tsx
import { createRoot } from 'react-dom/client'
import './src/index.css'
import App from './src/${name}/App'

createRoot(document.getElementById('root')!).render(<App />)
`,
    )
  }

  if (!existsSync(htmlFile)) {
    touched = true
    await writeFile(
      htmlFile,
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${Name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.${name}.tsx"></script>
  </body>
</html>
`,
    )
  }

  if (touched) await updateViteConfig(dir, name)
}

async function updateViteConfig(dir: string, name: string): Promise<void> {
  return
  const configPath = join(dir, 'vite.config.ts')
  if (!existsSync(configPath)) {
    throw new Error(`vite.config.ts not found in ${dir}`)
  }

  let src = await readFile(configPath, 'utf8')
  const entryFile = `${name}.html`
  if (src.includes(entryFile)) return // already registered

  if (!/\bresolve\b/.test(src)) {
    src = `import { resolve } from 'node:path'\n` + src
  }

  const entry = `${name}: resolve(__dirname, '${entryFile}'),`
  const seedMain = `main: resolve(__dirname, 'index.html'),`

  if (/input\s*:\s*{/.test(src)) {
    src = src.replace(/input\s*:\s*{/, (m) => `${m}\n        ${entry}`)
  } else if (/rollupOptions\s*:\s*{/.test(src)) {
    src = src.replace(
      /rollupOptions\s*:\s*{/,
      (m) => `${m}\n      input: {\n        ${seedMain}\n        ${entry}\n      },`,
    )
  } else if (/build\s*:\s*{/.test(src)) {
    src = src.replace(
      /build\s*:\s*{/,
      (m) =>
        `${m}\n    rollupOptions: {\n      input: {\n        ${seedMain}\n        ${entry}\n      },\n    },`,
    )
  } else {
    src = src.replace(
      /defineConfig\(\s*{/,
      (m) =>
        `${m}\n  build: {\n    rollupOptions: {\n      input: {\n        ${seedMain}\n        ${entry}\n      },\n    },\n  },`,
    )
  }

  await writeFile(configPath, src)
}
