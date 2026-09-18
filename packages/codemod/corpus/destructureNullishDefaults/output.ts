/* src/button.ts */

type ButtonOpts = {
  size?: number
  width?: number
  color?: string
  label?: string
  gap?: number
  radius?: number
  weight?: number
  border?: number | null
  mode?: 'light' | 'dark'
  onClick?: () => void
  style?: { margin?: number }
}

type Props = { theme: { gap?: number } }

export function basic(opts: ButtonOpts) {
  /// the single-declarator case
  const { size = 12 } = opts
  return size
}

export function adjacent(opts: ButtonOpts) {
  /// three adjacent statements on the same object merge into one pattern.
  /// `label`'s default still sees `size`: pattern elements bind left to right.
  const { size = 12, color = 'black', label = `${size}px` } = opts
  return [size, color, label]
}

export function renamed(opts: ButtonOpts) {
  /// binding name differs from the property, so the element is written `prop: name = fallback`
  const { size: fontSize = 12 } = opts
  return fontSize
}

export function sameStatement(opts: ButtonOpts) {
  /// multiple declarators in one statement collapse the same way
  const { size = 12, color = 'black' } = opts
  return [size, color]
}

export function manyDefaults(opts: ButtonOpts) {
  /// more than 3 elements (or a line over 100 chars) breaks onto its own lines
  const {
    size = 12,
    color = 'black',
    gap = 4,
    radius = 2,
    weight = 400,
  } = opts
  return [size, color, gap, radius, weight]
}

export function mixedKinds(opts: ButtonOpts) {
  /// `const` and `let` never merge: each keeps its own statement
  const { size = 12 } = opts
  let { color = 'black' } = opts
  color = color.toUpperCase()
  return [size, color]
}

export function differentObjects(opts: ButtonOpts, fallback: ButtonOpts) {
  /// different source objects, so no merge
  const { size = 12 } = opts
  const { color = 'black' } = fallback
  return [size, color]
}

export function nestedObject(opts: ButtonOpts) {
  /// each is rewritten against its own object; the second still reads the first's binding
  const { style = {} } = opts
  const { margin = 0 } = style
  return margin
}

export function chained(props: Props) {
  /// a dotted chain is fine as the source object
  const { gap = 8 } = props.theme
  return gap
}

export function interrupted(opts: ButtonOpts) {
  /// a non-candidate statement in between splits the run into two groups
  const { size = 12 } = opts
  const label = opts.label
  const { color = 'black' } = opts
  return [size, label, color]
}

export function withComments(opts: ButtonOpts) {
  /// a trailing comment pins its statement to its own line, so nothing merges here
  /// and every comment stays attached to the statement it was written for
  // base size in px
  const { size = 12 } = opts
  const { color = 'black' } = opts // any css color
  const { gap = 4 } = opts
  return [size, color, gap]
}

export class Chip {
  constructor(private opts: ButtonOpts) {}

  render() {
    /// `this.x` is a valid source object, and indentation follows the statement
    const { size = 12, color = 'black' } = this.opts
    return [size, color]
  }
}

export function ternaries(opts: ButtonOpts) {
  /// `!== undefined`, `=== undefined` and `!= null` all reduce to the same pattern;
  /// the first two are exact — a pattern default fires on undefined and nothing else
  const { size = 12, gap = 4, radius = 2 } = opts
  return [size, gap, radius]
}

export function flipped(opts: ButtonOpts) {
  /// the literal may sit on either side of the comparison
  const { gap = 4 } = opts
  return gap
}

export function orSafe(opts: ButtonOpts, noop: () => void) {
  /// `||` converts when the type has no falsy value but undefined: an object,
  /// a literal union with no '' member, a function
  const { style = {}, mode = 'light', onClick = noop } = opts
  return [style, mode, onClick]
}

export function orUnsafe(opts: ButtonOpts) {
  /// left alone: `0` and `''` would start taking the fallback. `strict` converts both,
  /// merging them into one pattern; `or: false` leaves every truthy form alone
  const size = opts.size || 12
  const color = opts.color || 'black'
  return [size, color]
}

export function mixedModes(opts: ButtonOpts) {
  /// the three forms merge into one pattern — only the source object has to match
  const { size = 12, gap = 4, style = {} } = opts
  return [size, gap, style]
}

export function ternaryEdges(opts: ButtonOpts, noop: () => void) {
  /// `number | null | undefined`, and `!= null` catches the null. `strict` converts it
  const border = opts.border != null ? opts.border : 1
  /// a strict test against null alone: undefined falls through to `opts.weight`, not to 400.
  /// no option converts this one — there is no pattern default that means it
  const weight = opts.weight !== null ? opts.weight : 400
  /// truthy test on a string — `''` would change meaning. `strict` converts it
  const label = opts.label ? opts.label : 'x'
  /// truthy test on a function, which is never falsy
  const { onClick = noop } = opts
  /// the branch returns a different property than the one tested
  const width = opts.size !== undefined ? opts.width : 12
  return [border, weight, label, onClick, width]
}

export function multilineFallback(opts: ButtonOpts) {
  /// a fallback spanning lines is left alone (it would wreck the pattern's shape),
  /// but a rewrite inside it still happens
  const onClick = opts.onClick ?? (() => {
    const { gap = 4 } = opts
    console.log(gap)
  })
  return onClick
}

/// nothing in here is rewritten under the default options
export function skipped(opts: ButtonOpts, loose: any, maybe?: ButtonOpts) {
  /// `number | null | undefined`: `??` catches null, a pattern default does not. `strict` converts it
  const border = opts.border ?? 1
  /// optional chain — `maybe` itself may be undefined. structural, so `strict` does not apply
  const size = maybe?.size ?? 12
  /// an explicit type annotation has nowhere to go on a pattern element
  const color: string = opts.color ?? 'black'
  /// `loose` is `any`, so the read could be null. `strict` converts it
  const gap = loose.gap ?? 4
  /// left side of the outer `??` is another `??`, not a property read
  const radius = opts.radius ?? opts.size ?? 2
  /// parenthesized: the initializer is not the binary expression itself
  const weight = (opts.weight ?? 400)
  /// element access rather than property access
  const label = opts['label'] ?? ''
  return [border, size, color, gap, radius, weight, label]
}
