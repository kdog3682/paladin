// @paladin/scaffold-v2/README.md

# @paladin/scaffold-v2

```ts
import { scaffold, DEFAULTS } from "@paladin/scaffold-v2"
import type { FileContent, ProjectData, ScaffoldOptions } from "@paladin/scaffold-v2"
```

## `scaffold(files: FileContent[], options?: ScaffoldOptions): Promise<ProjectData>`

```ts
interface FileContent {
  content: string   // must start with // @org/pkg/file.ts path comment
  id?: string
}
```

```ts
interface ScaffoldOptions {
  baseProjectDir?: string         // default: "~/projects"
  workspaceFolders?: string[]     // default: ["packages", "apps"]
  defaultWorkspaceFolder?: string // default: "packages"
  depCachePath?: string           // default: ~/.cache/paladin/bun-dependency-cache.json
  transforms?: ContentTransform[] // default: DEFAULTS.transforms
  matchers?: Matcher[]            // default: DEFAULTS.matchers
}
```

```ts
interface ProjectData {
  isNew: boolean
  projectDir: string
  projectName: string
  files: string[]
  packages: {
    isNew: boolean
    packageDir: string
    packageName: string
    newDependenciesInstalled: string[]
    files: { isNew: boolean, relativePath: string }[]
  }[]
  errors: BashResult[]
}
```
