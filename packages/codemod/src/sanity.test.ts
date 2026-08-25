import { expect, test } from 'bun:test'
import { printReport, testAll } from './test'

test('every codemod corpus fixture passes', async () => {
  const { pass, summaries } = await testAll()
  if (!pass) console.log(summaries.map(printReport).join('\n\n'))
  expect(pass).toBe(true)
})
