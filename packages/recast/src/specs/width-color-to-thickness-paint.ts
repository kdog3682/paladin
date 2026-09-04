/**
 * renames `width` -> `thickness` and `color` -> `paint`, but only on shapes
 * whose entire member list is exactly those two keys
 *
 * matches four node kinds:
 *   { width: 2, color: RED }              object literal
 *   const { width, color } = opts         destructuring pattern
 *   type Foo = { width: number, ... }     type literal
 *   interface Foo { width: number, ... }  interface body
 *
 * a shape is skipped if it has a third key, a spread, a computed key, a
 * method, or (for interfaces) an `extends` clause — any of those mean the
 * type carries more than the pair we are renaming
 *
 * shorthand is expanded rather than renamed in place, so `{ width, color }`
 * becomes `{ thickness: width, paint: color }` and the local binding or
 * referenced variable stays intact
 *
 * note this does not chase call sites: a literal passed to a renamed
 * interface that happens to carry extra keys will not match, so run
 * `tsc --noEmit` afterward to catch the stragglers
 */

import * as recast from "recast"

const b = recast.types.builders

export const args = {
    dir: "/home/kdog3682/projects/mathpen/packages/manim/src/document",
}

const RENAMES: Record<string, string> = {
    width: "thickness",
    color: "paint",
}

const TARGET_KEYS = Object.keys(RENAMES)

/**
 * static (non-computed) key name of a property / property signature
 * returns null for computed keys, spreads, methods, etc
 */
function keyName(node: any): string | null {
    if (!node || node.computed) return null
    const key = node.key
    if (!key) return null
    if (key.type === "Identifier") return key.name
    if (key.type === "StringLiteral" || key.type === "Literal") {
        return typeof key.value === "string" ? key.value : null
    }
    return null
}

/**
 * true only when the member list is exactly {width, color} — nothing more,
 * nothing less, no spreads, no computed keys
 */
function isExactMatch(members: any[], allowed: string[]): boolean {
    if (members.length !== TARGET_KEYS.length) return false
    if (!members.every((m) => allowed.includes(m.type))) return false

    const names = members.map(keyName)
    if (names.some((n) => n == null)) return false
    return TARGET_KEYS.every((t) => names.includes(t))
}

function renameKey(prop: any): void {
    const name = keyName(prop)
    if (!name) return
    const next = RENAMES[name]
    if (!next) return

    const key = prop.key
    if (key.type === "Identifier") {
        key.name = next
    } else {
        prop.key = b.identifier(next)
    }

    // {width, color} -> {thickness: width, paint: color}
    // keeps the local binding / referenced identifier intact
    if (prop.shorthand) prop.shorthand = false
}

export function transform(ast: any): number {
    let edits = 0

    const hit = (members: any[], allowed: string[]) => {
        if (!isExactMatch(members, allowed)) return
        members.forEach(renameKey)
        edits += 1
    }

    recast.types.visit(ast, {
        // { width: 2, color: RED }
        visitObjectExpression(path) {
            hit(path.node.properties ?? [], ["ObjectProperty", "Property"])
            this.traverse(path)
        },

        // const { width, color } = opts
        visitObjectPattern(path) {
            hit(path.node.properties ?? [], ["ObjectProperty", "Property"])
            this.traverse(path)
        },

        // type Foo = { width: number, color: string }
        visitTSTypeLiteral(path) {
            hit(path.node.members ?? [], ["TSPropertySignature"])
            this.traverse(path)
        },

        // interface Foo { width: number, color: string }
        visitTSInterfaceDeclaration(path) {
            // an `extends` clause means the shape has more than {width, color}
            if (!path.node.extends?.length) {
                hit(path.node.body?.body ?? [], ["TSPropertySignature"])
            }
            this.traverse(path)
        },
    })

    return edits
}
