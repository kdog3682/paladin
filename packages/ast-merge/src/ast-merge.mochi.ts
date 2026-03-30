// @paladin/ast-merge/ast-merge.mochi.ts

import { mergeContent } from '@paladin/ast-merge'

/* merges import specifiers from the same module */
export function mergeImports() {
  const existing = `import { useState } from 'react'`
  const incoming = `import { useState, useEffect } from 'react'`
  return mergeContent(existing, incoming)
}

/* adds new imports without touching existing ones */
export function addNewImport() {
  const existing = `import { useState } from 'react'`
  const incoming = `import { clsx } from 'clsx'`
  return mergeContent(existing, incoming)
}

/* merges default + named imports from the same module */
export function mergeDefaultAndNamed() {
  const existing = `import React from 'react'`
  const incoming = `import { useEffect } from 'react'`
  return mergeContent(existing, incoming)
}

/* incoming function replaces existing by default */
export function replaceFunction() {
  const existing = `function greet() { return 'hello' }`
  const incoming = `function greet() { return 'hey' }`
  return mergeContent(existing, incoming)
}

/* keeps existing function when onConflict is 'existing' */
export function keepExisting() {
  const existing = `function greet() { return 'hello' }`
  const incoming = `function greet() { return 'hey' }`
  return mergeContent(existing, incoming, { onConflict: 'existing' })
}

/* keeps both declarations when onConflict is 'both' */
export function keepBoth() {
  const existing = `const x = 1`
  const incoming = `const x = 2`
  return mergeContent(existing, incoming, { onConflict: 'both' })
}

/* merges interface members, incoming wins on duplicate props */
export function mergeInterfaceMembers() {
  const existing = `
interface User {
  name: string
  age: number
}
`
  const incoming = `
interface User {
  age: string
  email: string
}
`
  return mergeContent(existing, incoming)
}

/* replaces interface entirely when mergeInterfaces is false */
export function replaceInterface() {
  const existing = `
interface User {
  name: string
  age: number
}
`
  const incoming = `
interface User {
  id: number
}
`
  return mergeContent(existing, incoming, { mergeInterfaces: false })
}

/* merges export specifiers from the same source */
export function mergeReExports() {
  const existing = `export { foo } from './utils'`
  const incoming = `export { bar } from './utils'`
  return mergeContent(existing, incoming)
}

/* incoming export default replaces existing */
export function replaceExportDefault() {
  const existing = `export default function App() { return null }`
  const incoming = `export default function App() { return 'hi' }`
  return mergeContent(existing, incoming)
}

/* full file merge — imports combined, declarations reconciled, order preserved */
export function fullFileMerge() {
  const existing = `
import { useState } from 'react'
import { Button } from '@shadcn/ui'

interface Props {
  title: string
}

export function App({ title }: Props) {
  const [count, setCount] = useState(0)
  return <div>{title}</div>
}
`
  const incoming = `
import { useState, useEffect } from 'react'
import { clsx } from 'clsx'

interface Props {
  title: string
  className?: string
}

export function App({ title, className }: Props) {
  const [count, setCount] = useState(0)
  useEffect(() => {}, [])
  return <div className={clsx(className)}>{title}</div>
}
`
  return mergeContent(existing, incoming)
}
