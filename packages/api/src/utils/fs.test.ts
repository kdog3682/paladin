// src/utils/fs.test.ts
import { glob } from './fs'

// console.log(await glob('.', 'src/**/*.ts'))
// console.log(await glob('.', 'src/**/*.{ts,tsx}'))
// console.log(await glob('.', resolve('src/utils', '*.ts')))
// console.log(await glob('.', resolve('.', 'package.json')))
// console.log(await glob('.', resolve('src', '**/*.ts')))

console.log(process.cwd())
console.log(await  glob('.', 'src/**/resolve-path*.ts'))
console.log(await  glob('.', '**/resolve-path*.ts'))
