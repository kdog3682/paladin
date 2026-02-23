import { describe, expect, it } from "bun:test"
import { renderToString } from "react-dom/server"
import { App } from "@/App"

describe("App markup snapshot", () => {
  it("matches snapshot", () => {
    const html = renderToString(<App />)
    expect(html).toMatchSnapshot()
  })
})
