import { docgenPackage } from './docgen'

const target = '/home/kdog3682/projects/paladin/packages/codemod/'

console.log(await docgenPackage(target, { barrel: false }))
