import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { bash } from "@paladin/utils"
import { parseGitChunks } from "./gitchunks"

const dirs: string[] = []

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

async function git(dir: string, ...args: string[]): Promise<string> {
  const result = await bash(["git", ...args], { cwd: dir })
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`)
  return result.stdout
}

function write(dir: string, files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
}

/* temp repo with `base` committed as the first commit */
async function makeRepo(base: Record<string, string>): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "gitchunks-"))
  dirs.push(dir)
  await git(dir, "init", "-q")
  await git(dir, "config", "user.email", "test@example.com")
  await git(dir, "config", "user.name", "test")
  await git(dir, "config", "commit.gpgsign", "false")
  write(dir, { "package.json": `{"name": "root", "private": true}`, ...base })
  await git(dir, "add", "-A")
  await git(dir, "commit", "-q", "-m", "base")
  return dir
}

async function subjects(dir: string): Promise<string[]> {
  return (await git(dir, "log", "--format=%s")).trim().split("\n")
}

async function filesIn(dir: string, rev: string): Promise<string[]> {
  return (await git(dir, "show", "--name-only", "--format=", rev)).trim().split("\n").filter(Boolean)
}

async function dirty(dir: string): Promise<string[]> {
  /* not `status --porcelain`: bash() trims stdout, which eats the first line's leading space */
  return (await git(dir, "ls-files", "--modified", "--others", "--exclude-standard")).split("\n").filter(Boolean)
}

const PKG = "packages/txflow"

describe("parseGitChunks", () => {
  test("update: grammar existed at HEAD, exports sniffed from src/index.ts, types skipped", async () => {
    const dir = await makeRepo({
      [`${PKG}/package.json`]: `{"name": "@paladin/txflow", "version": "0.0.1"}`,
      [`${PKG}/README.md`]: "# txflow\n",
      [`${PKG}/src/other.ts`]: "export const other = 1\n",
      [`${PKG}/src/grammar/grammar.ts`]: "export const parser = 1\n",
      [`${PKG}/src/index.ts`]: [
        `export {parser, txflow, txflowLanguage} from "./grammar"`,
        `export type {TxToken} from "./grammar"`,
        `export {type TxScope, trackScope} from "./grammar"`,
        `export {other} from "./other"`,
      ].join("\n"),
    })

    write(dir, {
      [`${PKG}/src/grammar/grammar.ts`]: "export const parser = 2\n",
      [`${PKG}/package.json`]: `{"name": "@paladin/txflow", "version": "0.0.2"}`,
      [`${PKG}/README.md`]: "# txflow\n\nupdated\n",
      [`${PKG}/src/other.ts`]: "export const other = 2\n",
    })

    const report = String(await parseGitChunks(dir))
    const log = await subjects(dir)

    expect(log).toContain("fix(txflow/grammar): patch `parser`")
    expect(log).toContain("chore(txflow/docs): update `README.md`")
    /* two units are equally close in time, so the docs stay their own commit */
    expect(log).toContain("chore(deps): update package.json")
    expect(log).toHaveLength(5)
    expect(await dirty(dir)).toEqual([])
    expect(report).not.toContain("TxToken")
  })

  test("create: new grammar dir, pulls in src/index.ts that re-exports it", async () => {
    const dir = await makeRepo({
      [`${PKG}/package.json`]: `{"name": "@paladin/txflow"}`,
      [`${PKG}/src/index.ts`]: `export {other} from "./other"\n`,
    })

    write(dir, {
      [`${PKG}/src/grammar/index.ts`]: `export {parser, txflow} from "./grammar"\nexport type {Tok} from "./grammar"\n`,
      [`${PKG}/src/grammar/grammar.ts`]: "export const parser = 1\nexport const txflow = 2\nexport type Tok = string\n",
      [`${PKG}/src/index.ts`]: `export {other} from "./other"\nexport {parser, txflow} from "./grammar"\n`,
    })

    await parseGitChunks(dir)

    expect(await subjects(dir)).toEqual(["feat(txflow/grammar): create `parser` & `txflow`", "base"])
    expect(await dirty(dir)).toEqual([])
  })

  test("falls back to src/grammar/grammar.ts when there is no index", async () => {
    const dir = await makeRepo({ [`${PKG}/package.json`]: `{"name": "@paladin/txflow"}` })

    write(dir, {
      [`${PKG}/src/grammar/grammar.ts`]: [
        "export const parser = 1",
        "export function txflow() {}",
        "export type Tok = string",
        "export interface Scope {}",
        "// export const commented = 1",
      ].join("\n"),
    })

    await parseGitChunks(dir)

    expect((await subjects(dir))[0]).toBe("feat(txflow/grammar): create `parser` & `txflow`")
  })

  test("groups .md files per package", async () => {
    const dir = await makeRepo({
      "packages/a/package.json": `{"name": "a"}`,
      "packages/b/package.json": `{"name": "b"}`,
    })

    write(dir, {
      "packages/a/README.md": "a\n",
      "packages/a/docs/guide.md": "guide\n",
      "packages/b/CHANGELOG.md": "b\n",
    })

    await parseGitChunks(dir)

    const log = await subjects(dir)
    expect(log).toContain("chore(a/docs): update `README.md` & `guide.md`")
    expect(log).toContain("chore(b/docs): update `CHANGELOG.md`")
    expect(log).toHaveLength(3)

    const aRev = log[0] === "chore(a): update documentation" ? "HEAD" : "HEAD~1"
    expect((await filesIn(dir, aRev)).sort()).toEqual(["packages/a/README.md", "packages/a/docs/guide.md"])
  })

  test("dry run commits nothing, and the lone README rides with the lone unit", async () => {
    const dir = await makeRepo({ [`${PKG}/package.json`]: `{"name": "@paladin/txflow"}` })
    write(dir, { [`${PKG}/src/grammar/grammar.ts`]: "export const parser = 1\n", [`${PKG}/README.md`]: "x\n" })

    const report = String(await parseGitChunks(dir, { dry: true }))

    expect(await subjects(dir)).toEqual(["base"])
    expect(report).toContain("planned feat(txflow/grammar): create `parser`")
    expect(report).toContain("README.md")
    expect(report).toContain("1 commit(s) planned")
  })

  test("move: a delete plus an untracked twin is one refactor, not add + remove", async () => {
    const dir = await makeRepo({
      "packages/utils/package.json": `{"name": "@paladin/utils"}`,
      "packages/utils/src/fs/collectExports.ts": "export function collectExports() {\n  return []\n}\n",
      "packages/utils/src/collectImports.ts": "export function collectImports() {\n  return []\n}\n",
      "packages/utils/src/index.ts": [
        `export * from "./fs/collectExports"`,
        `export * from "./collectImports"`,
      ].join("\n"),
    })

    rmSync(join(dir, "packages/utils/src/fs/collectExports.ts"))
    rmSync(join(dir, "packages/utils/src/collectImports.ts"))
    write(dir, {
      "packages/utils/src/ast/collectExports.ts": "export function collectExports() {\n  return []\n}\n",
      "packages/utils/src/ast/collectImports.ts": "export function collectImports() {\n  return [1]\n}\n",
      "packages/utils/src/index.ts": [
        `export * from "./ast/collectExports"`,
        `export * from "./ast/collectImports"`,
      ].join("\n"),
    })

    const report = String(await parseGitChunks(dir, { dry: true }))

    expect(report).toContain("refactor(utils/ast): move `collectExports.ts` & `collectImports.ts` from src/fs and src")
    expect(report).not.toContain("deprecate")
    expect(report).not.toContain("removed: collectExports")
    /* the barrel names both halves of the move, so it waits for them in its own commit */
    expect(report).toContain("refactor(utils): wire up `ast`")
  })

  test("deps: lockfile, snapshots and package.json land in one chore(deps) at the end", async () => {
    const dir = await makeRepo({
      "bun.lock": "lock v1\n",
      "npm-dependencies.json": `{"zod": "^3.0.0"}`,
      "bun-deps.json": `{"zod": "^3.0.0"}`,
      "packages/a/package.json": `{"name": "a", "dependencies": {"zod": "^3.0.0"}}`,
      "packages/a/src/thing.ts": "export const thing = 1\n",
    })

    write(dir, {
      "bun.lock": "lock v2\n",
      "npm-dependencies.json": `{"zod": "^4.0.0"}`,
      "bun-deps.json": `{"zod": "^4.0.0"}`,
      "packages/a/package.json": `{"name": "a", "dependencies": {"zod": "^4.0.0"}}`,
      "packages/a/src/thing.ts": "export const thing = 2\n",
    })

    await parseGitChunks(dir)

    const log = await subjects(dir)
    expect(log).toContain("chore(deps): bump `zod`, update lockfile")
    expect(log).toHaveLength(3)
    /* deps is the last thing committed, ie the first line of the log */
    expect(log[0]).toBe("chore(deps): bump `zod`, update lockfile")
    expect((await filesIn(dir, "HEAD")).sort()).toEqual([
      "bun-deps.json",
      "bun.lock",
      "npm-dependencies.json",
      "packages/a/package.json",
    ])
  })

  test("deps: manifest, lockfile and snapshots ride with the one unit that imports the dep", async () => {
    const dir = await makeRepo({
      "bun.lock": "lock v1\n",
      "npm-dependencies.json": `{}`,
      "bun-deps.json": `{}`,
      "packages/a/package.json": `{"name": "a", "dependencies": {}}`,
      "packages/a/src/keep.ts": "export const keep = 1\n",
    })

    write(dir, {
      "bun.lock": "lock v2\n",
      "npm-dependencies.json": `{"zod": "^3.0.0"}`,
      "bun-deps.json": `{"zod": "^3.0.0"}`,
      "packages/a/package.json": `{"name": "a", "dependencies": {"zod": "^3.0.0"}}`,
      "packages/a/src/schema.ts": `import { z } from "zod"\nexport const schema = z.string()\n`,
    })

    await parseGitChunks(dir)

    const log = await subjects(dir)
    expect(log).toEqual(["feat(a/schema): create `schema`", expect.any(String)])
    expect((await filesIn(dir, "HEAD")).sort()).toEqual([
      "bun-deps.json",
      "bun.lock",
      "npm-dependencies.json",
      "packages/a/package.json",
      "packages/a/src/schema.ts",
    ])
    expect(log).not.toContain("chore(deps)")
  })

  test("order: a module lands before the package that imports it", async () => {
    const dir = await makeRepo({
      "packages/utils/package.json": `{"name": "@paladin/utils"}`,
      "packages/utils/src/index.ts": `export * from "./old"\n`,
      "packages/utils/src/old.ts": "export const old = 1\n",
      "packages/app/package.json": `{"name": "@paladin/app"}`,
      "packages/app/src/keep.ts": "export const keep = 1\n",
    })

    write(dir, {
      "packages/utils/src/helper/helper.ts": "export const helper = 1\n",
      "packages/utils/src/index.ts": `export * from "./old"\nexport * from "./helper/helper"\n`,
      "packages/app/src/tool.ts": `import {helper} from "@paladin/utils"\n\nexport const tool = helper\n`,
    })

    await parseGitChunks(dir)

    /* newest first, so the consumer sits on top of the module it imports */
    const log = await subjects(dir)
    expect(log).toEqual(["feat(app/tool): create `tool`", "feat(utils/helper): create `helper`", "base"])
    expect((await filesIn(dir, "HEAD~1")).sort()).toEqual([
      "packages/utils/src/helper/helper.ts",
      "packages/utils/src/index.ts",
    ])
  })

  test("scope skips namespace dirs and never repeats itself", async () => {
    const dir = await makeRepo({
      "packages/api2/package.json": `{"name": "@paladin/api2"}`,
      "packages/api2/src/services/scaffold/deps.ts": "const inner = 1\nexport const deps = 1\n",
      "packages/api2/src/services/scaffold/deps.test.ts": "const t = 1\n",
      "packages/api2/src/fastDependencyList.ts": "const inner = 1\nexport const list = 1\n",
    })

    write(dir, {
      "packages/api2/src/services/scaffold/deps.ts": "const inner = 2\nexport const deps = 1\n",
      "packages/api2/src/services/scaffold/deps.test.ts": "const t = 2\n",
      "packages/api2/src/fastDependencyList.ts": "const inner = 2\nexport const list = 1\n",
    })

    const log = String(await parseGitChunks(dir, { dry: true }))

    expect(log).toContain("(api2/scaffold): ")
    expect(log).not.toContain("api2/services")
    expect(log).toContain("fix(api2/fastDependencyList): patch internals")
  })

  test("clean tree and non-repo dirs", async () => {
    const dir = await makeRepo({})
    expect(String(await parseGitChunks(dir))).toContain("OK: working tree clean")

    const plain = mkdtempSync(join(tmpdir(), "gitchunks-plain-"))
    dirs.push(plain)
    expect(String(await parseGitChunks(plain))).toContain("ERROR: not a git repo")
  })
})
