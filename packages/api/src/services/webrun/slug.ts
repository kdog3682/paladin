import { basename, dirname } from 'node:path'

export function kebab(input: string) {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

// CodeEditor/demo.tsx  -> { component: 'CodeEditor', slug: 'code-editor-demo' }
// Commandline/foobar.demo.tsx -> { component: 'Commandline', slug: 'commandline-foobar-demo' }
export function deriveRoute(file: string) {
  const component = basename(dirname(file))
  const base = basename(file).replace(/\.tsx?$/, '')
  const slug = `${kebab(component)}-${kebab(base)}`
  return { component, base, slug }
}
