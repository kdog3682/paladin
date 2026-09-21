import { useState } from "react"

export function zebra() {
  return <p id="zebra">stripes</p>
}

export function apple() {
  const [n, setN] = useState(0)
  return <button id="apple" onClick={() => setN(n + 1)}>clicked {n}</button>
}

export function data() {
  return { a: 1 }
}

export function broken() {
  throw new Error("boom")
}

export const notAFunction = 3
