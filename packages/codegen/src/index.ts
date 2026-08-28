import * as recast from "recast"
import tsParser from "recast/parsers/babel-ts"

const { visit } = recast.types
const n = recast.types.namedTypes

type Node = any

const parse = (src: string) => recast.parse(src, { parser: tsParser })

export { codeMerge }

/**
 * Merge source `b` into source `a`.
 * - imports: merged per-source, no duplicate specifiers
 * - classes: same-named classes get b's missing methods/props appended
 * - everything else: top-level symbols not already declared in a are appended
 */
function codeMerge(a: string, b: string): string {
    const astA = parse(a)
    const astB = parse(b)

    const bodyA: Node[] = astA.program.body
    const bodyB: Node[] = astB.program.body

    mergeImports(bodyA, bodyB)
    const mergedClasses = mergeClasses(bodyA, bodyB)
    mergeSymbols(bodyA, bodyB, mergedClasses)

    return recast.print(astA).code
}

/* ---------------------------------------------------------------- imports */

const importKey = (s: Node): string => {
    if (n.ImportDefaultSpecifier.check(s)) return "default"
    if (n.ImportNamespaceSpecifier.check(s)) return "namespace"
    const imported = s.imported.name ?? s.imported.value
    return `named:${imported}`
}

const isTypeOnly = (d: Node) => d.importKind === "type"

function mergeImports(bodyA: Node[], bodyB: Node[]) {
    const bySource = new Map<string, Node>()

    for (const stmt of bodyA) {
        if (!n.ImportDeclaration.check(stmt)) continue
        bySource.set(`${stmt.source.value}::${isTypeOnly(stmt)}`, stmt)
    }

    let insertAt = lastImportIndex(bodyA) + 1
    const pending: Node[] = []

    for (const stmt of bodyB) {
        if (!n.ImportDeclaration.check(stmt)) continue
        const key = `${stmt.source.value}::${isTypeOnly(stmt)}`
        const target = bySource.get(key)

        if (!target) {
            pending.push(stmt)
            bySource.set(key, stmt)
            continue
        }

        // side-effect import (`import "./x"`) — nothing to merge
        if (!stmt.specifiers?.length) continue

        const seen = new Set((target.specifiers ?? []).map(importKey))
        for (const spec of stmt.specifiers) {
            const k = importKey(spec)
            if (seen.has(k)) continue
            seen.add(k)
            // default/namespace go first, named after
            if (k === "default" || k === "namespace") target.specifiers.unshift(spec)
            else target.specifiers.push(spec)
        }
    }

    bodyA.splice(insertAt, 0, ...pending)
}

function lastImportIndex(body: Node[]): number {
    let i = -1
    body.forEach((stmt, idx) => {
        if (n.ImportDeclaration.check(stmt)) i = idx
    })
    return i
}

/* ---------------------------------------------------------------- classes */

const unwrap = (stmt: Node): Node =>
    n.ExportNamedDeclaration.check(stmt) || n.ExportDefaultDeclaration.check(stmt)
        ? (stmt.declaration ?? stmt)
        : stmt

const memberName = (m: Node): string => {
    const k = m.key
    if (!k) return ""
    if (n.Identifier.check(k)) return k.name
    if (n.StringLiteral.check(k) || n.NumericLiteral.check(k)) return String(k.value)
    return recast.print(k).code
}

const memberKey = (m: Node): string => {
    const parts = [
        m.static ? "static" : "instance",
        m.kind ?? m.type, // get / set / method / constructor / property
        m.computed ? `[${recast.print(m.key).code}]` : memberName(m),
    ]
    return parts.join(":")
}

/** returns the set of class names that were merged in place (so they aren't re-appended) */
function mergeClasses(bodyA: Node[], bodyB: Node[]): Set<string> {
    const classesA = new Map<string, Node>()
    for (const stmt of bodyA) {
        const d = unwrap(stmt)
        if (n.ClassDeclaration.check(d) && d.id) classesA.set(d.id.name, d)
    }

    const merged = new Set<string>()

    for (const stmt of bodyB) {
        const d = unwrap(stmt)
        if (!n.ClassDeclaration.check(d) || !d.id) continue
        const target = classesA.get(d.id.name)
        if (!target) continue

        merged.add(d.id.name)

        if (!target.superClass && d.superClass) target.superClass = d.superClass
        if (d.implements?.length) {
            const have = new Set((target.implements ?? []).map((x: Node) => recast.print(x).code))
            target.implements = target.implements ?? []
            for (const impl of d.implements) {
                const code = recast.print(impl).code
                if (!have.has(code)) {
                    have.add(code)
                    target.implements.push(impl)
                }
            }
        }

        const seen = new Set(target.body.body.map(memberKey))
        for (const member of d.body.body) {
            const k = memberKey(member)
            if (seen.has(k)) continue
            seen.add(k)
            target.body.body.push(member)
        }
    }

    return merged
}

/* ------------------------------------------------------- top-level symbols */

function declaredNames(stmt: Node): string[] {
    const d = unwrap(stmt)
    if (!d) return []

    if (n.FunctionDeclaration.check(d) || n.ClassDeclaration.check(d)) {
        return d.id ? [d.id.name] : []
    }
    if (n.TSInterfaceDeclaration.check(d) || n.TSTypeAliasDeclaration.check(d)) {
        return [d.id.name]
    }
    if (n.TSEnumDeclaration.check(d) || n.TSModuleDeclaration.check(d)) {
        return d.id?.name ? [d.id.name] : []
    }
    if (n.VariableDeclaration.check(d)) {
        const names: string[] = []
        for (const decl of d.declarations) collectPatternNames(decl.id, names)
        return names
    }
    if (n.ImportDeclaration.check(d)) {
        return (d.specifiers ?? []).map((s: Node) => s.local.name)
    }
    return []
}

function collectPatternNames(node: Node, out: string[]) {
    if (!node) return
    if (n.Identifier.check(node)) return void out.push(node.name)
    if (n.ObjectPattern.check(node)) {
        for (const p of node.properties) {
            collectPatternNames(p.value ?? p.argument ?? p.key, out)
        }
        return
    }
    if (n.ArrayPattern.check(node)) {
        for (const el of node.elements) collectPatternNames(el, out)
        return
    }
    if (n.AssignmentPattern.check(node)) return collectPatternNames(node.left, out)
    if (n.RestElement.check(node)) return collectPatternNames(node.argument, out)
}


function mergeSymbols(bodyA: Node[], bodyB: Node[], mergedClasses: Set<string>) {
    const taken = new Set<string>()
    for (const stmt of bodyA) for (const name of declaredNames(stmt)) taken.add(name)

    const seenStatements = new Set(
        bodyA.filter((s) => declaredNames(s).length === 0).map((s) => recast.print(s).code.trim()),
    )

    for (const stmt of bodyB) {
        if (n.ImportDeclaration.check(stmt)) continue

        const d = unwrap(stmt)
        if (n.ClassDeclaration.check(d) && d.id && mergedClasses.has(d.id.name)) continue

        const names = declaredNames(stmt)

        if (names.length === 0) {
            // bare statement / export list — dedupe on printed source
            const code = recast.print(stmt).code.trim()
            if (seenStatements.has(code)) continue
            seenStatements.add(code)
            bodyA.push(stmt)
            continue
        }

        if (names.every((name) => taken.has(name))) continue
        for (const name of names) taken.add(name)
        bodyA.push(stmt)
    }
}
