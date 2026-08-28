import { describe, expect, test } from "bun:test"
import { dispatch, UnknownCommandError } from "./index"
import { ScaffoldService } from "../scaffold"

const opts = { pathResolution: { base: "/base" } }

describe("dispatch", () => {
  test("calls the named command with kwargs", async () => {
    const scaffold = new ScaffoldService(opts)
    const result = await dispatch(scaffold, "foobar", { hello: true })
    expect(result).toEqual({ sessions: 0, hello: true })
  })

  test("throws for an unknown command", async () => {
    const scaffold = new ScaffoldService(opts)
    expect(dispatch(scaffold, "nope")).rejects.toThrow(UnknownCommandError)
  })
})
