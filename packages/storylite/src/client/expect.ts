// a small expect for play functions: the common jest matchers plus the dom ones
// (jest-dom's names), and a `fn()` spy. no dependencies, so it runs in the page.

function show(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v)
  if (typeof v === "function") return (v as any).mock ? "[mock fn]" : "[Function]"
  if (typeof Element !== "undefined" && v instanceof Element) return `<${v.tagName.toLowerCase()}>`
  try {
    return JSON.stringify(v) ?? String(v)
  } catch {
    return String(v)
  }
}

function equal(a: any, b: any): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  return ak.length === bk.length && ak.every((k) => k in b && equal(a[k], b[k]))
}

export type Mock<A extends any[] = any[], R = any> = ((...args: A) => R) & {
  mock: { calls: A[]; results: R[] }
  mockClear(): void
}

/** a spy: records its calls, and runs `impl` if given */
export function fn<A extends any[] = any[], R = any>(impl?: (...args: A) => R): Mock<A, R> {
  const spy = ((...args: A) => {
    spy.mock.calls.push(args)
    const out = impl?.(...args) as R
    spy.mock.results.push(out)
    return out
  }) as Mock<A, R>
  spy.mock = { calls: [], results: [] }
  spy.mockClear = () => {
    spy.mock.calls = []
    spy.mock.results = []
  }
  return spy
}

type Outcome = { pass: boolean; to: string }

const text = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim()
const mockOf = (v: any): Mock => {
  if (!v?.mock) throw new Error(`expected a mock fn (from fn()), got ${show(v)}`)
  return v
}

const matchers: Record<string, (r: any, ...a: any[]) => Outcome> = {
  toBe: (r, e) => ({ pass: Object.is(r, e), to: `be ${show(e)}` }),
  toEqual: (r, e) => ({ pass: equal(r, e), to: `equal ${show(e)}` }),
  toBeTruthy: (r) => ({ pass: !!r, to: "be truthy" }),
  toBeFalsy: (r) => ({ pass: !r, to: "be falsy" }),
  toBeNull: (r) => ({ pass: r === null, to: "be null" }),
  toBeUndefined: (r) => ({ pass: r === undefined, to: "be undefined" }),
  toBeDefined: (r) => ({ pass: r !== undefined, to: "be defined" }),
  toBeGreaterThan: (r, e) => ({ pass: r > e, to: `be greater than ${show(e)}` }),
  toBeLessThan: (r, e) => ({ pass: r < e, to: `be less than ${show(e)}` }),
  toHaveLength: (r, e) => ({ pass: r?.length === e, to: `have length ${e} (got ${r?.length})` }),
  toContain: (r, e) => ({ pass: r?.includes?.(e) ?? false, to: `contain ${show(e)}` }),
  toMatch: (r, e) => ({ pass: typeof e === "string" ? String(r).includes(e) : e.test(String(r)), to: `match ${String(e)}` }),
  toThrow: (r, e) => {
    try {
      r()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { pass: e === undefined || (typeof e === "string" ? msg.includes(e) : e.test(msg)), to: `throw ${e === undefined ? "" : String(e)}`.trim() }
    }
    return { pass: false, to: `throw ${e === undefined ? "" : String(e)}`.trim() }
  },

  toHaveBeenCalled: (r) => ({ pass: mockOf(r).mock.calls.length > 0, to: "have been called" }),
  toHaveBeenCalledTimes: (r, n) => ({ pass: mockOf(r).mock.calls.length === n, to: `have been called ${n} times (called ${mockOf(r).mock.calls.length})` }),
  toHaveBeenCalledWith: (r, ...a) => ({
    pass: mockOf(r).mock.calls.some((c) => equal(c, a)),
    to: `have been called with ${show(a)} (calls: ${show(mockOf(r).mock.calls)})`,
  }),

  toBeInTheDocument: (r) => ({ pass: !!r && r.isConnected, to: "be in the document" }),
  toBeVisible: (r) => {
    const style = r?.isConnected ? getComputedStyle(r) : null
    return { pass: !!style && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0", to: "be visible" }
  },
  toBeDisabled: (r) => ({ pass: !!r?.matches?.(":disabled"), to: "be disabled" }),
  toBeEnabled: (r) => ({ pass: !!r && !r.matches(":disabled"), to: "be enabled" }),
  toBeChecked: (r) => ({ pass: !!r?.checked || r?.getAttribute?.("aria-checked") === "true", to: "be checked" }),
  toHaveFocus: (r) => ({ pass: document.activeElement === r, to: "have focus" }),
  toHaveValue: (r, e) => ({ pass: equal(r?.value, e), to: `have value ${show(e)} (got ${show(r?.value)})` }),
  toHaveClass: (r, ...names: string[]) => ({ pass: names.every((n) => r?.classList?.contains(n)), to: `have class ${names.join(" ")}` }),
  toHaveAttribute: (r, name: string, e?: string) => ({
    pass: !!r?.hasAttribute?.(name) && (e === undefined || r.getAttribute(name) === e),
    to: `have attribute ${name}${e === undefined ? "" : `=${show(e)}`} (got ${show(r?.getAttribute?.(name))})`,
  }),
  toHaveTextContent: (r, e) => {
    const got = r ? text(r) : ""
    return { pass: typeof e === "string" ? got.includes(e) : e.test(got), to: `have text ${String(e)} (got ${show(got)})` }
  },
}

type Matchers = { [K in keyof typeof matchers]: (...args: any[]) => void }
export type Expectation = Matchers & { not: Matchers }

/** `expect(value).toBe(1)`, `expect(canvas.getByRole("button")).toBeDisabled()`, `.not.` to flip any of them */
export function expect(received: unknown): Expectation {
  const build = (negate: boolean): Expectation =>
    new Proxy({} as Expectation, {
      get(_, name: string) {
        if (name === "not" && !negate) return build(true)
        const matcher = matchers[name]
        if (!matcher) throw new Error(`expect(...).${name} is not a matcher storylite has`)
        return (...args: any[]) => {
          const { pass, to } = matcher(received, ...args)
          if (pass === negate) throw new Error(`expected ${show(received)} ${negate ? "not " : ""}to ${to}`)
        }
      },
    })
  return build(false)
}
