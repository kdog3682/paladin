import { test, expect } from "bun:test"
import { parse } from "./parse"

// parse() is fcache-wrapped: it takes a PATH and stats it, not file contents.
// import.meta.dir anchors this to the test file's own directory, so it works
// no matter which directory `bun test` runs from.
const fixture = `${import.meta.dir}/parse.fixture.ts`

test("parse", async () => {
    expect(await parse(fixture)).toMatchSnapshot()
})
