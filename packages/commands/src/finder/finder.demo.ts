import { relative } from 'node:path'
import { homedir } from 'node:os'
import { finder, parseSnippet } from './finder'

const snippet = process.argv[2]
  ?? 'bring in the `inoremap` engine and the `qw` `ql` `qe` stuff to packages/codemirror'

const home = homedir()
const short = (p?: string) => p ? `~/${relative(home, p)}` : '-'

console.log('snippet :', snippet)
console.log('parsed  :', parseSnippet(snippet))

const t0 = performance.now()
const { packages, start, hits } = await finder(snippet)
const ms = Math.round(performance.now() - t0)

console.log('packages:', packages)
console.log('start   :', start.map(short))
console.log()

for (const h of hits) {
  if (h.kind === 'missing') {
    console.log(`✗ ${h.name}  (not found)`)
    continue
  }
  const loc = `${short(h.file)}:${h.line}`
  if (h.kind === 'symbol') console.log(`✓ ${h.name}  symbol → ${loc}`)
  else if (h.via) console.log(`✓ ${h.name}  field → ${h.via} → ${loc}  (field in ${short(h.fieldFile)})`)
  else console.log(`✓ ${h.name}  inline field → ${loc}`)
}

console.log(`\n${hits.length} names in ${ms}ms`)
