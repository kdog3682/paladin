import { test, expect } from "bun:test"
import { parse } from "./parse"

const fixture = `${import.meta.dir}/parse.fixture.ts`

test("parse", async () => {
    expect(await parse(fixture)).toMatchSnapshot()
})

test("typeReferences", async () => {
    const doc = await parse(fixture)
    const byName = Object.fromEntries(doc.symbols.map(s => [s.name, s]))

    // `Promise<Row | null>` references Row, not the Promise wrapper.
    expect(byName.fetchRow?.typeReferences).toEqual(["Row"])

    // `interface Box<T ...> extends Widget` references Widget, not the type param T.
    expect(byName.Box?.typeReferences).toContain("Widget")

    // primitives, void, and built-in generics never surface as references.
    expect(byName.add?.typeReferences).toEqual([])
    expect(byName.stacked?.typeReferences).toEqual([])
})
