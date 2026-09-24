import {build} from './build'

const {manifest, unpacked, zip} = await build({
  name: 'history',
  dev: process.argv.includes('--dev'),
})

console.log()
console.log('manifest', manifest)
console.log('load unpacked from', unpacked)
if (zip) console.log('zip at', zip)
