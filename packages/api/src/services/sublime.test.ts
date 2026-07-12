import { afterAll, describe, expect, mock, test } from 'bun:test'

const CONTENT = `# Packages/User/git_commit_user_dir.py
import sublime
import sublime_plugin
import subprocess
import os
from datetime import datetime
COMMIT_MESSAGE_PREFIX = "Auto commit"
class GitCommitUserDirCommand(sublime_plugin.ApplicationCommand):
    def run(self):
        user_dir = os.path.join(sublime.packages_path(), "User")
        message = f"{COMMIT_MESSAGE_PREFIX}: {datetime.now().isoformat()}"
        try:
            subprocess.run(["git", "add", "-A"], cwd=user_dir, check=True)
            subprocess.run(["git", "commit", "-m", message], cwd=user_dir, check=True)
            sublime.status_message("Committed User dir changes")
        except subprocess.CalledProcessError as e:
            sublime.error_message(f"Git commit failed: {e}")
`

const writes: Record<string, string> = {}

mock.module('fs', () => ({
  existsSync: () => false,
  mkdirSync: () => undefined,
}))

const originalFile = Bun.file
const originalWrite = Bun.write

Bun.file = ((path: string) => ({ text: async () => writes[path] ?? '' })) as typeof Bun.file
Bun.write = (async (path: string, data: string) => {
  writes[path] = data
  return data.length
}) as typeof Bun.write

const { handleSublime } = await import('./sublime')

afterAll(() => {
  Bun.file = originalFile
  Bun.write = originalWrite
})

describe('handleSublime', () => {
  test('normalizes a raw Packages/User header and writes the plugin body', async () => {
    const handled = await handleSublime([CONTENT])
    expect(handled).toBe(true)

    const written = Object.entries(writes).find(([path]) => path.endsWith('git_commit_user_dir.py'))
    expect(written).toBeDefined()
    expect(written![1]).toContain('class GitCommitUserDirCommand')
    expect(written![1]).not.toContain('Packages/User')
  })

  test('derives the command name from the class and registers the palette entry', () => {
    const palette = Object.entries(writes).find(([path]) => path.endsWith('Default.sublime-commands'))
    expect(palette).toBeDefined()
    expect(JSON.parse(palette![1])).toEqual([
      { caption: 'User: Git Commit User Dir', command: 'git_commit_user_dir' },
    ])
  })
})
