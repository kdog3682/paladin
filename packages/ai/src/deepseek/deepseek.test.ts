// @paladin/ai/deepseek/deepseek.test.ts

import { describe, test, expect } from "bun:test"
import {
  deepseek,
  choose,
  fill,
  classify,
  extract,
  yesno,
  label,
  tag,
} from "@paladin/ai/deepseek"

describe("deepseek", () => {
  test("basic prompt", async () => {
    const result = await deepseek("What is 2+2? Reply with just the number.")
    expect(result.trim()).toBe("4")
  })
})

describe("choose", () => {
  test("picks correct option", async () => {
    const result = await choose({
      prompt: "What color is the sky on a clear day?",
      choices: ["red", "blue", "green"],
    })
    expect(result).toBe("blue")
  })
})

describe("fill", () => {
  test("fills blanks", async () => {
    const result = await fill({
      template: "The capital of France is ___.",
    })
    expect(result.toLowerCase()).toContain("paris")
  })
})

describe("classify", () => {
  test("classifies sentiment", async () => {
    const result = await classify({
      input: "I love this product, it's amazing!",
      categories: ["positive", "negative", "neutral"],
    })
    expect(result).toBe("positive")
  })
})

describe("extract", () => {
  test("extracts fields", async () => {
    const result = await extract({
      input: "John Smith is 30 years old and lives in NYC.",
      fields: ["name", "age", "city"],
    })
    expect(result.name).toContain("John")
    expect(result.age).toBe("30")
    expect(result.city).toContain("NY")
  })
})

describe("yesno", () => {
  test("returns boolean", async () => {
    const result = await yesno({ prompt: "Is the earth round?" })
    expect(result).toBe(true)
  })
})

describe("label", () => {
  test("generates labels", async () => {
    const result = await label({
      input: "A photo of a golden retriever playing in a park",
      count: 3,
    })
    expect(result).toBeArray()
    expect(result.length).toBe(3)
  })
})

describe("tag", () => {
  test("picks from predefined tags", async () => {
    const result = await tag({
      input: "Just deployed our new React app to production",
      tags: ["frontend", "backend", "devops", "design", "database"],
      count: 2,
    })
    expect(result.length).toBeLessThanOrEqual(2)
    expect(result.some(t => ["frontend", "devops"].includes(t))).toBe(true)
  })

  test("generates freeform tags", async () => {
    const result = await tag({
      input: "Homemade sourdough bread with rosemary",
      count: 3,
    })
    expect(result).toBeArray()
    expect(result.length).toBeLessThanOrEqual(3)
  })
})
