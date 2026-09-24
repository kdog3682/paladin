import {buildReactApp} from "./build-react-app"

const entry = "/home/kdog3682/projects/paladin/packages/web2/src/codemirror.app.tsx"

const res = await buildReactApp(entry)

console.log({
  root: res.root,
  usedExisting: res.usedExisting,
  outFile: res.outFile,
})
