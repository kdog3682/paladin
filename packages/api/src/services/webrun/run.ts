import { homedir } from 'node:os'
import { join } from 'node:path'
import { webrun } from './webrun'

const PACKAGE_ROOT = join(homedir(), 'projects', 'paladin', 'packages', 'web')
const FILES = [
  join(PACKAGE_ROOT, 'ui', 'CodeEditor', 'demo.tsx'),
  join(PACKAGE_ROOT, 'ui', 'CodeEditor', 'demo2.tsx'),
  join(PACKAGE_ROOT, 'ui', 'Commandline', 'foobar.demo.tsx'),
]

await webrun(FILES, PACKAGE_ROOT)
