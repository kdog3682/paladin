import { describe, expect, test } from "bun:test"
import { codeMerge } from "./index"

const norm = (s: string) => s.replace(/\s+/g, " ").trim()
const has = (s: string, frag: string) => norm(s).includes(norm(frag))
const count = (s: string, frag: string) => norm(s).split(norm(frag)).length - 1

describe("imports", () => {
    test("merges named specifiers into the existing declaration", () => {
        const out = codeMerge(`import { a } from "./x"`, `import { a, b } from "./x"`)
        expect(has(out, `import { a, b } from "./x"`)).toBe(true)
        expect(count(out, `from "./x"`)).toBe(1)
    })

    test("keeps default and namespace slots distinct from named", () => {
        const out = codeMerge(`import { a } from "./x"`, `import d from "./x"`)
        expect(has(out, `import d, { a } from "./x"`)).toBe(true)
    })

    test("appends a new source after the last existing import", () => {
        const out = codeMerge(
            `import { a } from "./x"\n\nconst z = 1`,
            `import { c } from "./y"`,
        )
        expect(out.indexOf(`"./y"`)).toBeLessThan(out.indexOf("const z"))
    })

    test("type imports do not collapse into value imports", () => {
        const out = codeMerge(`import { A } from "./x"`, `import type { B } from "./x"`)
        expect(count(out, `from "./x"`)).toBe(2)
    })
})

describe("classes", () => {
    const a = `
class Foo {
    constructor() {
        this.x = 1
    }
    bar() {
        return 1
    }
}
`
    const b = `
class Foo {
    bar() {
        return 999
    }
    baz() {
        return 2
    }
    static qux() {}
    get bar() {
        return this.x
    }
}
`

    test("adds missing members, keeps existing ones untouched", () => {
        const out = codeMerge(a, b)
        expect(count(out, "class Foo")).toBe(1)
        expect(has(out, "return 999")).toBe(false)
        expect(has(out, "baz()")).toBe(true)
        expect(has(out, "static qux()")).toBe(true)
    })

    test("a getter is not the same member as a method of the same name", () => {
        const out = codeMerge(a, b)
        expect(has(out, "get bar()")).toBe(true)
    })

    test("picks up a superClass the base lacks", () => {
        const out = codeMerge(`class Foo {}`, `class Foo extends Base {}`)
        expect(has(out, "class Foo extends Base")).toBe(true)
    })
})

describe("symbols", () => {
    test("appends symbols the base does not declare", () => {
        const out = codeMerge(`const a = 1`, `const a = 2\nconst b = 3`)
        expect(has(out, "const a = 1")).toBe(true)
        expect(has(out, "const a = 2")).toBe(false)
        expect(has(out, "const b = 3")).toBe(true)
    })

    test("preserves exportedness of appended symbols", () => {
        const out = codeMerge(`const a = 1`, `export function go() {}`)
        expect(has(out, "export function go()")).toBe(true)
    })

    test("dedupes functions, types and interfaces by name", () => {
        const out = codeMerge(
            `type T = string\ninterface I { a: number }\nfunction f() {}`,
            `type T = number\ninterface I { b: string }\nfunction f() {}\ntype U = boolean`,
        )
        expect(count(out, "type T")).toBe(1)
        expect(has(out, "type T = string")).toBe(true)
        expect(count(out, "interface I")).toBe(1)
        expect(count(out, "function f()")).toBe(1)
        expect(has(out, "type U = boolean")).toBe(true)
    })

    test("handles destructured declarations", () => {
        const out = codeMerge(`const { a, b } = obj`, `const { a } = obj\nconst { c } = obj`)
        expect(count(out, "= obj")).toBe(2)
        expect(has(out, "const { c } = obj")).toBe(true)
    })

    test("dedupes bare statements on printed source", () => {
        const out = codeMerge(`setup()`, `setup()\nteardown()`)
        expect(count(out, "setup()")).toBe(1)
        expect(has(out, "teardown()")).toBe(true)
    })
})

describe("formatting", () => {
    test("leaves the base's own formatting and comments alone", () => {
        const a = `// keep me\nconst    weird   =  1\n`
        const out = codeMerge(a, `const other = 2`)
        expect(out.startsWith("// keep me\nconst    weird   =  1")).toBe(true)
    })

    test("is a no-op when b adds nothing", () => {
        const a = `import { x } from "./x"\n\nclass A {\n    go() {}\n}\n`
        expect(codeMerge(a, a)).toBe(a)
    })
})
