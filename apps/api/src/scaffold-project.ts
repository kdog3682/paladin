// @paladin/api/src/scaffold-project.ts

import { writeFile, mkdir, stat } from "fs/promises"
import { join } from "path"
import { $ } from "bun"
import { GitRepo } from "./vcs"

export interface ScaffoldEvent {
  event: "projectScaffolded"
  data: {
    projectDir: string
    org: string
    filesCreated: string[]
  }
}

async function fileExists(path: string): Promise<boolean> {
  return stat(path).then(() => true).catch(() => false)
}

async function writeIfMissing(path: string, content: string, created: string[]): Promise<void> {
  if (await fileExists(path)) return
  await mkdir(join(path, ".."), { recursive: true })
  await writeFile(path, content)
  created.push(path)
}

export async function scaffoldProject(repo: GitRepo, org: string): Promise<ScaffoldEvent | null> {
  if (await repo.exists()) return null

  const dir = repo.directory
  const created: string[] = []

  await repo.init()

  // Root package.json
  await writeIfMissing(join(dir, "package.json"), JSON.stringify({
    name: org,
    private: true,
    workspaces: ["apps/*", "packages/*"],
    scripts: {
      dev: "bun run --filter '*' dev",
      test: "bun run --filter '*' test",
      build: "bun run --filter '*' build",
    },
  }, null, 2) + "\n", created)

  // tsconfig.json
  await writeIfMissing(join(dir, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      lib: ["ESNext", "DOM"],
      module: "esnext",
      target: "esnext",
      moduleResolution: "bundler",
      moduleDetection: "force",
      allowImportingTsExtensions: true,
      strict: true,
      downlevelIteration: true,
      skipLibCheck: true,
      allowSyntheticDefaultImports: true,
      forceConsistentCasingInFileNames: true,
      allowJs: true,
      types: ["bun-types"],
      paths: {
        [`@${org}/web/*`]: ["./apps/web/src/*"],
        [`@${org}/api/*`]: ["./apps/api/src/*"],
        [`@${org}/*`]: ["./packages/*/src"],
      },
    },
  }, null, 2) + "\n", created)

  // apps/web/package.json
  await writeIfMissing(join(dir, "apps/web/package.json"), JSON.stringify({
    name: `@${org}/web`,
    type: "module",
    scripts: {
      dev: "vite --open",
      build: "vite build",
      preview: "vite preview",
    },
    dependencies: {
      "class-variance-authority": "^0.7.1",
      "lucide-react": "^0.563.0",
      react: "^18",
      "react-dom": "^18",
    },
    devDependencies: {
      "@tailwindcss/vite": "^4",
      "@types/react": "^18",
      "@types/react-dom": "^18",
      "@vitejs/plugin-react": "^4",
      tailwindcss: "^4",
      vite: "^5",
      "vite-tsconfig-paths": "^6.0.5",
    },
  }, null, 2) + "\n", created)

  // apps/web/vite.config.ts
  await writeIfMissing(join(dir, "apps/web/vite.config.ts"), [
    'import { defineConfig } from "vite"',
    'import react from "@vitejs/plugin-react"',
    'import tailwindcss from "@tailwindcss/vite"',
    'import tsconfigPaths from "vite-tsconfig-paths"',
    "",
    "export default defineConfig({",
    "  plugins: [react(), tailwindcss(), tsconfigPaths()],",
    "})",
    "",
  ].join("\n"), created)

  // apps/api/package.json
  await writeIfMissing(join(dir, "apps/api/package.json"), JSON.stringify({
    name: `@${org}/api`,
    type: "module",
    scripts: {
      dev: "bun --watch src/index.ts",
    },
    dependencies: {},
    devDependencies: {},
  }, null, 2) + "\n", created)

  // .gitignore
  await writeIfMissing(join(dir, ".gitignore"), [
    "node_modules",
    "dist",
    ".env",
    ".DS_Store",
    "bun.lock",
    "",
  ].join("\n"), created)

  // Ensure dirs exist
  await mkdir(join(dir, "apps/web/src"), { recursive: true })
  await mkdir(join(dir, "apps/api/src"), { recursive: true })
  await mkdir(join(dir, "packages"), { recursive: true })

  // Install
  await $`bun install`.cwd(dir).quiet()

  return {
    event: "projectScaffolded",
    data: { projectDir: dir, org, filesCreated: created },
  }
}
