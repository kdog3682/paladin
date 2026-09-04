================================================================
dev/index.html
================================================================
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>@{{PROJECT_NAME}}/{{PACKAGE_NAME}} — playground</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>

================================================================
dev/main.tsx
================================================================
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Playground } from "./playground"

const el = document.getElementById("root")
if (!el) throw new Error("missing #root")

createRoot(el).render(
  <StrictMode>
    <Playground />
  </StrictMode>
)

================================================================
dev/playground.tsx
================================================================
import { Button } from '@bklearn/shadcn'
import { Card, CardHeader, CardTitle, CardContent } from '@bklearn/shadcn'
import "../src/index.css"

export function Playground() {
  return (
    <Card className="max-w-md mx-auto mt-10">
      <CardHeader>
        <CardTitle>Hello World</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-muted-foreground">Welcome to the playground.</p>
        <Button onClick={() => alert('Clicked!')}>Click me</Button>
      </CardContent>
    </Card>
  )
}

================================================================
src/index.ts
================================================================

================================================================
src/index.css
================================================================
@import "tailwindcss";
@import "@bklearn/shadcn/globals.css";
@source "../node_modules/@bklearn/shadcn/dist";

================================================================
vite.config.ts
================================================================
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  root: "dev",
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
})

================================================================
happydom.ts
================================================================
import { GlobalRegistrator } from "@happy-dom/global-registrator"

GlobalRegistrator.register()

================================================================
package.json
================================================================
{
  "name": "@{{PROJECT_NAME}}/{{PACKAGE_NAME}}",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "sideEffects": ["**/*.css"],
  "files": ["src"],
  "exports": {
    ".": "./src/index.ts",
    "./*": "./src/components/*.tsx",
    "./styles": "./src/index.css"
  },
  "scripts": {
    "dev": "vite --open",
    "build": "vite build",
    "test": "bun test --preload ./happydom.ts"
  },
  "dependencies": {
    "@bklearn/shadcn": "^0.1.2",
    "lucide-react": "^0.563.0"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@happy-dom/global-registrator": "^20.0.10",
    "@tailwindcss/vite": "^4",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "@vitejs/plugin-react": "^4",
    "react": "^18",
    "react-dom": "^18",
    "tailwindcss": "^4",
    "vite": "^5.2.0",
    "vite-tsconfig-paths": "^6.0.5"
  }
}

================================================================
tsconfig.json
================================================================
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "types": ["vite/client"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "dev"]
}
