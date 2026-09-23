import { expect, test } from "bun:test"
import { expandHome } from "@paladin/utils"
import { isDeprecated, isWrite, write } from "../ops"
import { router } from "./router"
import type { Unit } from "../types"

const unit = (path: string): Unit => ({
  name: "widget",
  dir: "/tmp/acme/packages/widget",
  isNew: false,
  ops: [write("parseFileContent", path, '{"type":"authorized_user"}')],
})

test("reroutes a matching write to its fixed destination", () => {
  const original = "/tmp/acme/packages/widget/credentials.json"
  const ops = router(unit(original))

  const deprecated = ops.find(isDeprecated)
  expect(deprecated?.path).toBe(original)

  const rerouted = ops.find(isWrite)
  expect(rerouted?.path).toBe(expandHome("~/dotfiles/gapi/credentials.json"))
  expect(rerouted?.content).toBe('{"type":"authorized_user"}')
})

test("leaves unrelated writes alone", () => {
  const ops = router(unit("/tmp/acme/packages/widget/src/add.ts"))
  expect(ops).toEqual([])
})

test("skips a write already at its destination", () => {
  const dest = expandHome("~/dotfiles/gapi/credentials.json")
  const ops = router(unit(dest))
  expect(ops).toEqual([])
})

test("custom routes merge over the defaults", () => {
  const original = "/tmp/acme/packages/widget/service-account.json"
  const custom = unit(original)
  const ops = router(custom, { router: { "service-account.json": "~/dotfiles/gapi/service-account.json" } })

  expect(ops.find(isWrite)?.path).toBe(expandHome("~/dotfiles/gapi/service-account.json"))
})
