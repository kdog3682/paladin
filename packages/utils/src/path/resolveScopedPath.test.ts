import { describe, expect, test } from 'bun:test'
import { homedir } from 'os'
import { join } from 'path'
import { resolveScopedPath, toScopedPath, type ResolveScopedPathOptions } from './resolveScopedPath'

const base = '/base'
const relativeTo = '/base/paladin/packages/api/src'
const opts: ResolveScopedPathOptions = { base, relativeTo }

const web = '/base/paladin/packages/web'

const cases: [input: string, expected: string][] = [
  ['@paladin', '/base/paladin'],
  ['@paladin/web', web],
  ['@paladin/packages/web', web],
  ['@web/Foobar.tsx', `${web}/src/components/Foobar.tsx`],

  /* dangerous*/
  ['@paladin/web/src', `${web}/src/components`],

  ['@paladin/web/Foo/useFoo.ts', `${web}/src/components/Foo/useFoo.ts`],
  ['@paladin/web/src/Foo.tsx', `${web}/src/components/Foo.tsx`],
  ['@paladin/web/components/Foo.tsx', `${web}/src/components/Foo.tsx`],
  ['@paladin/web/src/components/Foo.tsx', `${web}/src/components/Foo.tsx`],
  ['@paladin/web/App.tsx', `${web}/src/App.tsx`],
  ['@paladin/web/src/App.tsx', `${web}/src/App.tsx`],
  ['@paladin/web/docs/readme.md', `${web}/docs/readme.md`],
  ['@paladin/web/scripts/build.ts', `${web}/scripts/build.ts`],
  ['@paladin/api/services/mail.ts', '/base/paladin/packages/api/src/services/mail.ts'],
  ['@paladin/api/src/services/mail.ts', '/base/paladin/packages/api/src/services/mail.ts'],
  ['@other/web/Foo.tsx', '/base/other/packages/web/src/components/Foo.tsx'],
  ['  @paladin/web  ', web],
  ['@web/Foo.tsx', `${web}/src/components/Foo.tsx`],
  ['@ui/Button.tsx', `${web}/src/components/ui/Button.tsx`],
  ['@services/mail.ts', '/base/paladin/packages/api/src/services/mail.ts'],
  ['@SymbolViewerApplet', '/base/paladin/packages/web2/src/SymbolViewerApplet'],
  [
    '@SymbolViewerApplet/useSymbols.ts',
    '/base/paladin/packages/web2/src/SymbolViewerApplet/useSymbols.ts'
  ],
  [
    '@SymbolViewerApplet/SymbolViewer.tsx',
    '/base/paladin/packages/web2/src/SymbolViewerApplet/SymbolViewer.tsx'
  ],
  ['paladin', '/base/paladin'],
  ['paladin/web/Foo.tsx', `${web}/src/components/Foo.tsx`],
  ['/etc/hosts', '/etc/hosts'],
  ['~/notes.md', join(homedir(), 'notes.md')],
  ['x.ts', `${relativeTo}/x.ts`],
  ['./x.ts', `${relativeTo}/x.ts`],
  ['../x.ts', '/base/paladin/packages/api/x.ts'],
  ['src/x.ts', `${relativeTo}/src/x.ts`],
  ['docs/readme.md', `${relativeTo}/docs/readme.md`]
]

describe('resolveScopedPath', () => {
  test.each(cases)('%s -> %s', (input, expected) => {
    expect(resolveScopedPath(input, opts)).toBe(expected)
  })
})

const throwCases: [input: string, message: RegExp][] = [
  ['', /empty path/],
  ['   ', /empty path/],
  ['someproject/lib/x.ts', /must be scoped/],
  ['@paladin/packages', /missing package/]
]

describe('resolveScopedPath throws', () => {
  test.each(throwCases)('%s', (input, message) => {
    expect(() => resolveScopedPath(input, opts)).toThrow(message)
  })

  test('relative input without a relativeTo dir', () => {
    expect(() => resolveScopedPath('x.ts', { base })).toThrow(/without a relativeTo dir/)
  })
})

const optionCases: [name: string, input: string, opts: ResolveScopedPathOptions, expected: string][] =
  [
    [
      'flat layout',
      '@paladin/web/Foo.tsx',
      { base, packagesDir: null },
      '/base/paladin/web/src/components/Foo.tsx'
    ],
    [
      'custom srcDirs leave the head dir alone',
      '@paladin/web/lib/Foo.tsx',
      { base, srcDirs: ['src', 'lib'] },
      `${web}/lib/Foo.tsx`
    ],
    [
      'srcDirs[0] is the default dir',
      '@paladin/web/Foo.tsx',
      { base, srcDirs: ['app'], routers: [] },
      `${web}/app/Foo.tsx`
    ],
    ['no routers, no components dir', '@paladin/web/Foo.tsx', { base, routers: [] }, `${web}/src/Foo.tsx`],
    [
      'router sees the dir-relative tail',
      '@paladin/web/src/Foo.tsx',
      { base, routers: [({ tail }) => join('generated', tail)] },
      `${web}/src/generated/Foo.tsx`
    ],
    [
      'router passing leaves the tail untouched',
      '@paladin/web/Foo.tsx',
      { base, routers: [() => null, () => undefined] },
      `${web}/src/Foo.tsx`
    ],
    [
      'capitalizedPrefix is replaceable',
      '@Applet/Foo.tsx',
      { base, capitalizedPrefix: '@paladin/api2/src/applets' },
      '/base/paladin/packages/api2/src/applets/Applet/Foo.tsx'
    ],
    [
      'aliases are replaceable',
      '@x/thing.ts',
      { base, aliases: { '@x': '@paladin/api' } },
      '/base/paladin/packages/api/src/thing.ts'
    ]
  ]

describe('resolveScopedPath options', () => {
  test.each(optionCases)('%s', (_name, input, options, expected) => {
    expect(resolveScopedPath(input, options)).toBe(expected)
  })
})

const toScopedCases: [input: string, expected: string][] = [
  ['/base/paladin', '@paladin'],
  ['/base/paladin/packages/web', '@paladin/web'],
  ['/base/paladin/packages/web/src/Foo.tsx', '@paladin/web/Foo.tsx'],
  ['/base/paladin/packages/web/src/components/Foo.tsx', '@paladin/web/components/Foo.tsx'],
  ['/base/paladin/packages/web/src/App.tsx', '@paladin/web/App.tsx'],
  ['/base/paladin/packages/web/docs/readme.md', '@paladin/web/docs/readme.md'],
  ['/base/paladin/packages/web/scripts/build.ts', '@paladin/web/scripts/build.ts'],
  ['/base/paladin/packages/api/src/services/mail.ts', '@paladin/api/services/mail.ts'],
  ['/base/paladin/packages/api/src', '@paladin/api/src']
]

describe('toScopedPath', () => {
  test.each(toScopedCases)('%s -> %s', (input, expected) => {
    expect(toScopedPath(input, { base })).toBe(expected)
  })
})

const toScopedThrowCases: [input: string, message: RegExp][] = [
  ['', /empty path/],
  ['   ', /empty path/],
  ['/etc/hosts', /not under base/]
]

describe('toScopedPath throws', () => {
  test.each(toScopedThrowCases)('%s', (input, message) => {
    expect(() => toScopedPath(input, { base })).toThrow(message)
  })
})

describe('toScopedPath options', () => {
  test('flat layout', () => {
    expect(toScopedPath('/base/paladin/web/src/Foo.tsx', { base, packagesDir: null })).toBe(
      '@paladin/web/Foo.tsx'
    )
  })
})
