import { registerBin } from './registerBin.ts'

const file = '/home/kdog3682/projects/mathpen/packages/manim/src/cli.ts'

console.log(await registerBin(file))
