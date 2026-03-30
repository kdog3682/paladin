// @paladin/squire/PLAN.md

# @paladin/squire

Package-scoped dev workflow tool: commit, revert, watch, test, demo.

## File Structure

```
src/
  core/                    ← functional core (pure, testable)
    version.ts             parse/increment wip(pkg): vN messages
    search.ts              search commit history by substring
    matcher.ts             match test/demo files by pattern
    status.ts              build status object from state
    resolve.ts             detect current pkg, discover monorepo packages

  shell/                   ← imperative shell (side effects)
    git.ts                 GitOps class (git restore, not checkout)
    reporter.ts            Reporter class (all output goes thru here)
    watcher.ts             PkgWatcher (fs.watch with abort)
    runner.ts              bun run / bun test
    deps.ts                es-module-lexer dep caching

  commands/                ← command handlers
    commit.ts              commit <message?>
    revert.ts              revert <query?>
    status.ts              status
    watch.ts               demo/test watcher factory

  cli.ts                   ← entry point, REPL loop
```

## CLI Flow

1. Auto-detect pkg from cwd (walk up for package.json)
2. If at root or can't find → show selectable list (a, b, c...)
3. REPL: commit, revert, status, demo, test, set, info, exit
4. All output through Reporter (no console.log)
5. Git uses `restore --source` not `checkout`
