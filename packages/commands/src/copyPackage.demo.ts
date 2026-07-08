import {copyPackage} from "@paladin/commands/copyPackage"

const from = "@paladin/cme"
const to = "@paladin/web"
const folders = ["src/extension", "src/keybindings"]

copyPackage(from, to, folders)
