// builtin import
import { readFile } from "fs/promises"
// workspace import
import { fcache } from "@paladin/fcache"
// external import
import Parser from "tree-sitter"
// relative import
import type { Param } from "../parse.types"

/**
 * Adds two numbers together.
 *
 * A classic multi-line JSDoc block.
 */
export function add(a: number, b: number): number {
  return a + b
}

// A single line comment as the description.
export function greet(name: string): string {
  return `hi ${name}`
}

// First line of a stacked comment.
// Second line of the same description.
// Third line, still part of it.
export function stacked(): void {}

/** A leading block comment. */
// followed by a line comment — both belong to the symbol.
function internalOnly(): void {}

// Default values declared in the signature.
export function withDefaults(
  retries = 3,
  label: string = "none",
  verbose?: boolean,
): void {}

// Default values via a destructured signature parameter.
export function withDestructure(
  { limit = 10, cursor }: { limit?: number; cursor?: string },
): void {}

/**
 * Options for something configurable.
 */
export type Options = {
  /** Maximum number of retries. */
  retries: number

  /** Timeout in milliseconds. */
  timeoutMs: number

  // another comment
  // comment
  abc: string
}

// A documented interface.
export interface Widget {
  // the widget id
  id: string

  /** human readable label */
  label: string
}

/** Registry of counters, exported as the module default. */
export default class Registry {
  // the backing store
  store: Map<string, number>

  /** Number of live entries. */
  size = 0

  // Looks up a value by key.
  get(key: string): number | undefined {
    return this.store.get(key)
  }
}

// A simple documented constant.
export const VERSION = "1.0.0"
