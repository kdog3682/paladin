import { test, expect } from 'bun:test'
import { resolvePath } from './resolve-path'

test('resolvePath snapshot', () => {
  const base = '~/projects'
  const activeDir = '~/projects/paladin'

  const cases = {
    script: resolvePath('build.mjs', base, activeDir),
    scopedPkg: resolvePath('@paladin/web/Foobar/useFoo.ts', base, activeDir),
    scopedPackagesPrefixed: resolvePath('@paladin/packages/core/index.ts', base, activeDir),
    scopedPkgNoTail: resolvePath('@paladin/core', base, activeDir),
    shorthandPaladin: resolvePath('paladin/ui/Button/index.tsx', base, activeDir),
    absolute: resolvePath('/tmp/foo.ts', base, activeDir),
    bareFilename: resolvePath('utils.ts', base, activeDir),
    dotRelative: resolvePath('./helpers/foo.ts', base, activeDir),
    projectRelative: resolvePath('myproj/web/Foobar/index.ts', base, activeDir),
  }

  expect(cases).toMatchSnapshot()
})
