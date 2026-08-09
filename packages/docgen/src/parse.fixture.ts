/* ---------------------------------------------------------------- imports */

// builtin import
import { readFile } from "fs/promises"
// builtin, node: prefixed and aliased
import { join as pathJoin } from "node:path"
// workspace import
import { fcache } from "@paladin/fcache"
// external default import
import Parser from "tree-sitter"
// external namespace import
import * as ts from "typescript"
// default and named in one clause
import React, { useState } from "react"
// type-only import
import type { Param } from "../parse.types"
// mixed: inline type specifier alongside a value
import { type FileDoc, parseSource } from "./parse"
// side-effect only, no bindings
import "./register"

/* -------------------------------------------------------------- functions */

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

// Destructured inside the body rather than the signature.
export function withBodyDestructure(options: { depth?: number; strict: boolean }): void {
  const { depth = 1, strict } = options
}

// A rest parameter after a required one.
export function joinAll(sep: string, ...parts: string[]): string {
  return parts.join(sep)
}

/** Fetches a row by id. */
export async function fetchRow(id: string): Promise<Row | null> {
  return null
}

// A generator function.
export function* counter(start = 0): Generator<number> {
  yield start
}

// Identity, generic over T.
export function identity<T>(value: T): T {
  return value
}

// Coerces a string into a number.
export function coerce(value: string): number
export function coerce(value: string, fallback: number): number
export function coerce(value: string, fallback?: number): number {
  return Number(value) || fallback || 0
}

/* --------------------------------------------------- comment edge cases */

// A file-level aside separated by a blank line. It should NOT attach below.

// The real description for looseComment.
export function looseComment(): void {}

export const INLINE = 1 // a trailing comment, not a description

// The description survives an intervening tooling directive.
// eslint-disable-next-line @typescript-eslint/no-empty-function
export function withDirective(): void {}

/* ------------------------------------------------------ types and enums */

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

/** Result of a parse attempt. Non-object type alias. */
export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E }

// Not exported inline — surfaced through the export clause at the bottom.
type Row = {
  // primary key
  id: string
}

// A documented interface.
export interface Widget {
  // the widget id
  id: string

  /** human readable label */
  label: string
}

/** A generic interface that extends another. */
export interface Box<T extends object = Record<string, unknown>> extends Widget {
  /** The boxed value. */
  readonly value: T

  // Unwraps the box.
  unwrap(): T

  /** Optional formatter. */
  format?(indent: number): string

  [key: string]: unknown
}

/** Log levels, lowest first. */
export enum Level {
  // quietest
  Debug = 0,
  /** the default level */
  Info = 1,
  Warn = 2,
}

/* ------------------------------------------------------------- classes */

/** Base class that registries extend. */
export abstract class Base {
  /** Must be implemented by subclasses. */
  abstract reset(): void
}

// Something that can be counted.
export interface Countable {
  /** Current count. */
  readonly size: number
}

/** Registry of counters, exported as the module default. */
export default class Registry extends Base implements Countable {
  // the backing store
  store: Map<string, number> = new Map()

  /** Number of live entries. */
  size = 0

  // shared across every instance
  static instances = 0

  // truly private, hard-private syntax
  #secret = "hidden"

  /** Label is injected as a constructor parameter property. */
  constructor(private readonly label: string, public verbose = false) {
    super()
  }

  // Looks up a value by key.
  get(key: string): number | undefined {
    return this.store.get(key)
  }

  /** Current label. */
  get name(): string {
    return this.label
  }

  // Renames the registry.
  set name(next: string) {}

  // Creates an empty registry.
  static create(): Registry {
    return new Registry("anon")
  }

  /** Loads asynchronously. */
  protected async load(): Promise<void> {}

  // Clears every counter.
  reset(): void {
    this.store.clear()
  }
}

/* ----------------------------------------------------------- variables */

// A simple documented constant.
export const VERSION = "1.0.0"

// Inferred from literal defaults.
export const RETRIES = 3
export const DEBUG = false
export const PATTERN = /a+/
export const TAGS = ["alpha", "beta"]
export const CLIENT = new Map<string, number>()

// Two constants declared in one statement.
export const LEFT = "l", RIGHT = "r"

// A mutable module-level counter.
export let hits = 0

/** Doubles a number. Declared as an arrow constant. */
export const double = (n: number): number => n * 2

// An async arrow with a destructured parameter.
export const load = async ({ id, force = false }: { id: string; force?: boolean }): Promise<void> => {}

// Only reachable through the export clause below.
const BUILD_ID = "abc123"

/* ---------------------------------------------------- export statements */

// Symbols exported through a clause rather than inline.
export { BUILD_ID, internalOnly as helper }

// A type-only export clause.
export type { Row as PublicRow }

// Re-exports.
export * from "./parse.types"
export * as helpers from "./helpers"
export { parseSource as reparse } from "./parse"
