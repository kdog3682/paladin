import { mochi } from './packages/mochi/src/runner.ts'

const suites = await mochi(['/home/kdog3682/projects/paladin/packages/ast-merge/src/ast-merge.mochi.ts'])
for (const suite of suites) {
  for (const r of suite.results) {
    if (r.error) {
      console.log('FAIL', r.name, r.error.message)
    } else {
      console.log('PASS', r.name)
      console.log(r.value)
      console.log('---')
    }
  }
}
