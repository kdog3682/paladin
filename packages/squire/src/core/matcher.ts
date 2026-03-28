// @paladin/squire/src/core/matcher.ts

export function matchTestFiles(files: string[], pattern?: string): string[] {
  const testFiles = files.filter(f => f.endsWith(".test.ts") || f.endsWith(".test.tsx"))
  if (!pattern) return testFiles
  const lower = pattern.toLowerCase()
  return testFiles.filter(f => f.toLowerCase().includes(lower))
}

export function findDemoFile(files: string[]): string | null {
  return files.find(f => f.endsWith(".demo.ts") || f.endsWith(".demo.tsx")) ?? null
}
